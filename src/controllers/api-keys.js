/**
 * API Key Management Controllers
 * Create, read, update, delete, and list API keys
 */

import { json } from '../utils/response.js';
import { getAllAvailablePermissions } from '../middleware/api-auth.js';

// Generate secure random API key
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 48;
  let key = 'wishesu_';

  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return key;
}

// Create new API key
export async function createApiKey(env, body) {
  try {
    const { name, permissions, expiresInDays } = body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return json({ error: 'Name and permissions array are required' }, 400);
    }

    // Validate permissions
    const availablePerms = getAllAvailablePermissions();
    const validPermissionStrings = availablePerms.map(p => p.permission);
    const invalidPerms = permissions.filter(p => !validPermissionStrings.includes(p) && p !== '*');

    if (invalidPerms.length > 0) {
      return json({ error: 'Invalid permissions', invalid: invalidPerms }, 400);
    }

    // Generate API key
    const keyValue = generateApiKey();

    // Calculate expiry if provided
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiresInDays);
      expiresAt = expiryDate.toISOString();
    }

    // Store in database
    const result = await env.DB.prepare(`
      INSERT INTO api_keys (key_name, key_value, permissions, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      name,
      keyValue,
      JSON.stringify(permissions),
      expiresAt
    ).run();

    if (!result.success) {
      throw new Error('Failed to create API key');
    }

    // Get the created key
    const keyRecord = await env.DB.prepare(`
      SELECT id, key_name, key_value, permissions, is_active, usage_count, last_used_at, created_at, expires_at
      FROM api_keys
      WHERE key_value = ?
    `).bind(keyValue).first();

    // Parse permissions for response
    let parsedPermissions = [];
    try {
      parsedPermissions = JSON.parse(keyRecord.permissions || '[]');
    } catch (e) {
      parsedPermissions = [];
    }

    return json({
      success: true,
      apiKey: {
        id: keyRecord.id,
        name: keyRecord.key_name,
        key: keyRecord.key_value, // Include key only on creation
        permissions: parsedPermissions,
        isActive: keyRecord.is_active === 1,
        usageCount: keyRecord.usage_count || 0,
        lastUsedAt: keyRecord.last_used_at,
        createdAt: keyRecord.created_at,
        expiresAt: keyRecord.expires_at
      },
      message: 'API key created successfully. Save the key value - it will not be shown again!'
    });

  } catch (err) {
    console.error('Create API key error:', err);
    return json({ error: err.message }, 500);
  }
}

// List all API keys (without sensitive key values)
export async function listApiKeys(env) {
  try {
    const keys = await env.DB.prepare(`
      SELECT id, key_name, permissions, is_active, usage_count, last_used_at, created_at, expires_at
      FROM api_keys
      ORDER BY created_at DESC
    `).all();

    // Parse permissions for each key
    const formattedKeys = (keys.results || []).map(key => {
      let parsedPermissions = [];
      try {
        parsedPermissions = JSON.parse(key.permissions || '[]');
      } catch (e) {
        parsedPermissions = [];
      }

      return {
        id: key.id,
        name: key.key_name,
        permissions: parsedPermissions,
        isActive: key.is_active === 1,
        usageCount: key.usage_count || 0,
        lastUsedAt: key.last_used_at,
        createdAt: key.created_at,
        expiresAt: key.expires_at
      };
    });

    return json({
      success: true,
      apiKeys: formattedKeys,
      total: formattedKeys.length
    });

  } catch (err) {
    console.error('List API keys error:', err);
    return json({ error: err.message }, 500);
  }
}

// Get single API key details
export async function getApiKey(env, id) {
  try {
    const key = await env.DB.prepare(`
      SELECT id, key_name, permissions, is_active, usage_count, last_used_at, created_at, expires_at
      FROM api_keys
      WHERE id = ?
    `).bind(id).first();

    if (!key) {
      return json({ error: 'API key not found' }, 404);
    }

    // Parse permissions
    let parsedPermissions = [];
    try {
      parsedPermissions = JSON.parse(key.permissions || '[]');
    } catch (e) {
      parsedPermissions = [];
    }

    // Get usage statistics
    const usageStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time_ms) as avg_response_time,
        MIN(created_at) as first_used_at,
        MAX(created_at) as last_used_at
      FROM api_key_usage
      WHERE api_key_id = ?
    `).bind(id).first();

    // Get recent usage (last 10 requests)
    const recentUsage = await env.DB.prepare(`
      SELECT endpoint, method, status_code, response_time_ms, ip_address, created_at
      FROM api_key_usage
      WHERE api_key_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(id).all();

    return json({
      success: true,
      apiKey: {
        id: key.id,
        name: key.key_name,
        permissions: parsedPermissions,
        isActive: key.is_active === 1,
        usageCount: key.usage_count || 0,
        lastUsedAt: key.last_used_at,
        createdAt: key.created_at,
        expiresAt: key.expires_at,
        stats: usageStats || {},
        recentUsage: recentUsage.results || []
      }
    });

  } catch (err) {
    console.error('Get API key error:', err);
    return json({ error: err.message }, 500);
  }
}

// Update API key
export async function updateApiKey(env, body) {
  try {
    const { id, name, permissions, isActive } = body;

    if (!id) {
      return json({ error: 'API key ID is required' }, 400);
    }

    // Check if key exists
    const existing = await env.DB.prepare(`
      SELECT id FROM api_keys WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return json({ error: 'API key not found' }, 404);
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('key_name = ?');
      params.push(name);
    }

    if (permissions !== undefined) {
      // Validate permissions
      const availablePerms = getAllAvailablePermissions();
      const validPermissionStrings = availablePerms.map(p => p.permission);
      const invalidPerms = permissions.filter(p => !validPermissionStrings.includes(p) && p !== '*');

      if (invalidPerms.length > 0) {
        return json({ error: 'Invalid permissions', invalid: invalidPerms }, 400);
      }

      updates.push('permissions = ?');
      params.push(JSON.stringify(permissions));
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return json({ error: 'No updates provided' }, 400);
    }

    params.push(id);

    await env.DB.prepare(`
      UPDATE api_keys
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...params).run();

    // Get updated key
    const updatedKey = await env.DB.prepare(`
      SELECT id, key_name, permissions, is_active, usage_count, last_used_at, created_at, expires_at
      FROM api_keys
      WHERE id = ?
    `).bind(id).first();

    // Parse permissions
    let parsedPermissions = [];
    try {
      parsedPermissions = JSON.parse(updatedKey.permissions || '[]');
    } catch (e) {
      parsedPermissions = [];
    }

    return json({
      success: true,
      apiKey: {
        id: updatedKey.id,
        name: updatedKey.key_name,
        permissions: parsedPermissions,
        isActive: updatedKey.is_active === 1,
        usageCount: updatedKey.usage_count || 0,
        lastUsedAt: updatedKey.last_used_at,
        createdAt: updatedKey.created_at,
        expiresAt: updatedKey.expires_at
      }
    });

  } catch (err) {
    console.error('Update API key error:', err);
    return json({ error: err.message }, 500);
  }
}

// Delete API key
export async function deleteApiKey(env, id) {
  try {
    if (!id) {
      return json({ error: 'API key ID is required' }, 400);
    }

    // Check if key exists
    const existing = await env.DB.prepare(`
      SELECT id FROM api_keys WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return json({ error: 'API key not found' }, 404);
    }

    // Delete key
    await env.DB.prepare(`
      DELETE FROM api_keys WHERE id = ?
    `).bind(id).run();

    // Also delete usage logs
    await env.DB.prepare(`
      DELETE FROM api_key_usage WHERE api_key_id = ?
    `).bind(id).run();

    return json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (err) {
    console.error('Delete API key error:', err);
    return json({ error: err.message }, 500);
  }
}

// Get available permissions
export async function getPermissionsList() {
  const permissions = getAllAvailablePermissions();

  // Group by resource
  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = [];
    }
    acc[perm.resource].push(perm);
    return acc;
  }, {});

  return json({
    success: true,
    permissions: grouped
  });
}

// Get API key usage analytics
export async function getApiKeyAnalytics(env, id) {
  try {
    const keyId = id || null;

    // Overall stats
    const overallStats = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT api_key_id) as active_keys,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as enabled_keys,
        SUM(usage_count) as total_requests_all_keys
      FROM api_keys
    `).first();

    // Requests by status code
    const statusCodeStats = await env.DB.prepare(`
      SELECT
        status_code,
        COUNT(*) as count
      FROM api_key_usage
      ${keyId ? 'WHERE api_key_id = ?' : ''}
      GROUP BY status_code
      ORDER BY status_code
    `).bind(keyId || null).all();

    // Top endpoints
    const topEndpoints = await env.DB.prepare(`
      SELECT
        endpoint,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time
      FROM api_key_usage
      ${keyId ? 'WHERE api_key_id = ?' : ''}
      GROUP BY endpoint
      ORDER BY request_count DESC
      LIMIT 20
    `).bind(keyId || null).all();

    // Requests over time (last 30 days)
    const requestsOverTime = await env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as request_count
      FROM api_key_usage
      WHERE created_at >= date('now', '-30 days')
      ${keyId ? 'AND api_key_id = ?' : ''}
      GROUP BY DATE(created_at)
      ORDER BY date
    `).bind(keyId || null).all();

    // Top API keys by usage
    const topKeys = await env.DB.prepare(`
      SELECT
        k.id,
        k.key_name,
        COUNT(u.id) as request_count,
        k.usage_count
      FROM api_keys k
      LEFT JOIN api_key_usage u ON k.id = u.api_key_id
      GROUP BY k.id
      ORDER BY request_count DESC
      LIMIT 10
    `).all();

    return json({
      success: true,
      analytics: {
        overall: overallStats || {},
        statusCodes: statusCodeStats.results || [],
        topEndpoints: topEndpoints.results || [],
        requestsOverTime: requestsOverTime.results || [],
        topKeys: topKeys.results || []
      }
    });

  } catch (err) {
    console.error('Get API key analytics error:', err);
    return json({ error: err.message }, 500);
  }
}

// API: Ping/Test endpoint for API keys
export async function pingApiKey(env) {
  return json({
    success: true,
    message: 'API Key is valid and server is responding.',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}
