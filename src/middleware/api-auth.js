/**
 * API Key Authentication Middleware
 * Provides permission-based access control for API endpoints
 */

import { json } from '../utils/response.js';

// Permission definitions for all resources
// Each resource has granular permissions: list, create, read, update, delete
export const PERMISSIONS = {
  products: {
    list: 'products:list',
    create: 'products:create',
    read: 'products:read',
    update: 'products:update',
    delete: 'products:delete'
  },
  orders: {
    list: 'orders:list',
    create: 'orders:create',
    read: 'orders:read',
    update: 'orders:update',
    delete: 'orders:delete',
    deliver: 'orders:deliver',
    revise: 'orders:revise'
  },
  reviews: {
    list: 'reviews:list',
    create: 'reviews:create',
    read: 'reviews:read',
    update: 'reviews:update',
    delete: 'reviews:delete'
  },
  coupons: {
    list: 'coupons:list',
    create: 'coupons:create',
    read: 'coupons:read',
    update: 'coupons:update',
    delete: 'coupons:delete',
    validate: 'coupons:validate'
  },
  pages: {
    list: 'pages:list',
    create: 'pages:create',
    read: 'pages:read',
    update: 'pages:update',
    delete: 'pages:delete',
    builder: 'pages:builder'
  },
  blogs: {
    list: 'blogs:list',
    create: 'blogs:create',
    read: 'blogs:read',
    update: 'blogs:update',
    delete: 'blogs:delete',
    comments: {
      list: 'blogs:comments:list',
      create: 'blogs:comments:create',
      update: 'blogs:comments:update',
      delete: 'blogs:comments:delete'
    }
  },
  forum: {
    list: 'forum:list',
    create: 'forum:create',
    read: 'forum:read',
    update: 'forum:update',
    delete: 'forum:delete',
    questions: {
      list: 'forum:questions:list',
      create: 'forum:questions:create',
      update: 'forum:questions:update',
      delete: 'forum:questions:delete'
    },
    replies: {
      list: 'forum:replies:list',
      create: 'forum:replies:create',
      update: 'forum:replies:update',
      delete: 'forum:replies:delete'
    }
  },
  users: {
    list: 'users:list',
    read: 'users:read',
    export: 'users:export'
  },
  chat: {
    list: 'chat:list',
    read: 'chat:read',
    send: 'chat:send',
    block: 'chat:block',
    delete: 'chat:delete'
  },
  settings: {
    read: 'settings:read',
    update: 'settings:update',
    seo: 'settings:seo',
    branding: 'settings:branding',
    automation: 'settings:automation',
    payments: 'settings:payments'
  },
  backup: {
    history: 'backup:history',
    create: 'backup:create',
    download: 'backup:download',
    restore: 'backup:restore'
  },
  export: {
    full: 'export:full',
    products: 'export:products',
    pages: 'export:pages',
    blogs: 'export:blogs',
    data: 'export:data'
  },
  import: {
    products: 'import:products',
    pages: 'import:pages',
    blogs: 'import:blogs'
  }
};

// Helper to get all permission strings for a resource
export function getAllPermissionsForResource(resource) {
  const resourcePerms = PERMISSIONS[resource];
  if (!resourcePerms) return [];

  const permissions = [];
  for (const key in resourcePerms) {
    if (typeof resourcePerms[key] === 'string') {
      permissions.push(resourcePerms[key]);
    } else if (typeof resourcePerms[key] === 'object') {
      // Nested permissions (e.g., blogs.comments)
      for (const nestedKey in resourcePerms[key]) {
        if (typeof resourcePerms[key][nestedKey] === 'string') {
          permissions.push(resourcePerms[key][nestedKey]);
        }
      }
    }
  }
  return permissions;
}

// Get all available permissions for admin UI
export function getAllAvailablePermissions() {
  const allPerms = [];

  for (const resource in PERMISSIONS) {
    const resourcePerms = PERMISSIONS[resource];

    for (const action in resourcePerms) {
      if (typeof resourcePerms[action] === 'string') {
        allPerms.push({
          resource,
          action,
          permission: resourcePerms[action],
          label: `${resource}:${action}`
        });
      } else if (typeof resourcePerms[action] === 'object') {
        // Handle nested permissions
        for (const nestedAction in resourcePerms[action]) {
          allPerms.push({
            resource,
            action: `${action}:${nestedAction}`,
            permission: resourcePerms[action][nestedAction],
            label: `${resource}:${action}:${nestedAction}`
          });
        }
      }
    }
  }

  return allPerms.sort((a, b) => a.permission.localeCompare(b.permission));
}

// Extract API key from request
function getApiKeyFromRequest(req) {
  // Check Authorization header first
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token) {
      return token;
    }
  }

  // Check X-API-Key header
  const xApiKey = req.headers.get('X-API-Key');
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

// Verify API key and get permissions
async function verifyApiKey(env, apiKey) {
  if (!apiKey || !env.DB) {
    return null;
  }

  try {
    // Find active API key in database
    const result = await env.DB.prepare(`
      SELECT id, key_name, permissions, usage_count, is_active, expires_at
      FROM api_keys
      WHERE key_value = ? AND is_active = 1
    `).bind(apiKey).first();

    if (!result) {
      return null;
    }

    // Check if key is expired
    if (result.expires_at) {
      const now = new Date();
      const expiry = new Date(result.expires_at);
      if (now > expiry) {
        return null; // Key expired
      }
    }

    // Parse permissions (stored as JSON string)
    let permissions = [];
    try {
      permissions = JSON.parse(result.permissions || '[]');
    } catch (e) {
      permissions = [];
    }

    return {
      id: result.id,
      name: result.key_name,
      permissions,
      usageCount: result.usage_count || 0
    };
  } catch (e) {
    console.error('API key verification error:', e);
    return null;
  }
}

// Check if API key has required permission
function hasPermission(apiKeyData, requiredPermission) {
  if (!apiKeyData || !requiredPermission) {
    return false;
  }

  // Admin with wildcard permission
  if (apiKeyData.permissions.includes('*')) {
    return true;
  }

  return apiKeyData.permissions.includes(requiredPermission);
}

// Log API key usage
async function logApiKeyUsage(env, apiKeyId, endpoint, method, statusCode, responseTime, ipAddress) {
  if (!apiKeyId || !env.DB) {
    return;
  }

  try {
    await env.DB.prepare(`
      INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, response_time_ms, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(apiKeyId, endpoint, method, statusCode, responseTime, ipAddress).run();

    // Increment usage count on the key
    await env.DB.prepare(`
      UPDATE api_keys
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(apiKeyId).run();
  } catch (e) {
    console.error('Failed to log API key usage:', e);
  }
}

// Get client IP address
function getClientIp(req) {
  const forwarded = req.headers.get('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('CF-Connecting-IP') || 'unknown';
}

// API key authentication middleware
export async function apiKeyAuth(req, env, requiredPermission) {
  // Extract API key
  const apiKey = getApiKeyFromRequest(req);

  if (!apiKey) {
    return json({ error: 'API key required. Provide via Authorization: Bearer <key> or X-API-Key header.' }, 401);
  }

  // Verify API key
  const apiKeyData = await verifyApiKey(env, apiKey);

  if (!apiKeyData) {
    return json({ error: 'Invalid or expired API key' }, 401);
  }

  // Check permission
  if (!hasPermission(apiKeyData, requiredPermission)) {
    return json({
      error: 'Insufficient permissions',
      required: requiredPermission,
      your_permissions: apiKeyData.permissions
    }, 403);
  }

  // Store API key data for usage logging and downstream use
  req.apiKeyData = apiKeyData;

  return null; // Authentication successful
}

// Combined authentication (admin cookie OR API key)
export async function requireAdminOrApiKey(req, env, requiredPermission) {
  // Try admin session first
  const isAdmin = await isAdminAuthed(req, env);

  if (isAdmin) {
    // Admin has full access, create mock API key data
    req.apiKeyData = {
      id: 'admin',
      name: 'Admin User',
      permissions: ['*'],
      usageCount: 0
    };
    return null;
  }

  // Fall back to API key authentication
  return await apiKeyAuth(req, env, requiredPermission);
}

// Import admin auth helper (defined in index.js)
// We need to duplicate it here to avoid circular dependency
async function isAdminAuthed(req, env) {
  const ADMIN_COOKIE = 'admin_session';
  const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

  const cookieHeader = req.headers.get('Cookie') || '';
  const value = getCookieValue(cookieHeader, ADMIN_COOKIE);
  if (!value) return false;

  const [tsStr, sig] = value.split('.');
  if (!tsStr || !sig) return false;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;

  const ageSec = Math.floor((Date.now() - ts) / 1000);
  if (ageSec < 0 || ageSec > ADMIN_MAX_AGE_SECONDS) return false;

  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return false;

  const expected = await hmacSha256(secret, tsStr);
  return expected === sig;
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return rest.join('=') || '';
  }
  return null;
}

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const base64url = (bytes) => {
    const b64 = btoa(String.fromCharCode(...bytes));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  return base64url(new Uint8Array(sig));
}

// Usage tracking wrapper for API responses
export async function trackApiUsage(req, res, env) {
  const startTime = Date.now();
  const response = res;
  const endpoint = new URL(req.url).pathname;
  const method = req.method;
  const statusCode = response.status;
  const ipAddress = getClientIp(req);

  // Log usage if API key was used
  if (req.apiKeyData && req.apiKeyData.id) {
    const responseTime = Date.now() - startTime;
    await logApiKeyUsage(
      env,
      req.apiKeyData.id,
      endpoint,
      method,
      statusCode,
      responseTime,
      ipAddress
    );
  }

  return response;
}
