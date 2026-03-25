/**
 * Admin controller - Admin tools and file uploads (Zero-CPU Direct Uploads)
 */

import { json } from '../utils/response.js';
import { CORS } from '../config/cors.js';
import { VERSION } from '../config/constants.js';
import { getMimeTypeFromFilename, resolveContentType } from '../utils/upload-helper.js';
import { normalizeArchiveMetaValue } from '../utils/formatting.js';

// Flag to track if version purge check was done
let purgeVersionChecked = false;

/**
 * Get debug info
 */
export function getDebugInfo(env) {
  return json({
    status: 'running',
    bindings: {
      DB: !!env.DB,
      R2_BUCKET: !!env.R2_BUCKET,
      PRODUCT_MEDIA: !!env.PRODUCT_MEDIA,
      ASSETS: !!env.ASSETS
    },
    version: VERSION,
    timestamp: new Date().toISOString()
  });
}

/**
 * Purge Cloudflare cache manually
 */
export async function purgeCache(env) {
  const zoneId = env.CF_ZONE_ID;
  const token = env.CF_API_TOKEN;
  if (!zoneId || !token) {
    return json({ error: 'CF_ZONE_ID or CF_API_TOKEN not configured' }, 500);
  }
  try {
    const purgeUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    const cfResp = await fetch(purgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ purge_everything: true })
    });
    const result = await cfResp.json();
    return json(result, cfResp.ok ? 200 : 500);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * Auto-purge cache on version change
 */
export async function maybePurgeCache(env, initDB) {
  if (!env || !env.DB || !env.CF_ZONE_ID || !env.CF_API_TOKEN) return;
  if (purgeVersionChecked) return;
  
  try {
    await initDB(env);
    
    let row = null;
    try {
      row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('last_purge_version').first();
    } catch (_) {}
    
    const lastVersion = row && row.value ? row.value.toString() : null;
    const currentVersion = VERSION.toString();
    
    if (lastVersion === currentVersion) {
      purgeVersionChecked = true;
      return;
    }
    
    const zoneId = env.CF_ZONE_ID;
    const token = env.CF_API_TOKEN;
    const purgeUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    
    await fetch(purgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ purge_everything: true })
    });
    
    await env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).bind('last_purge_version', currentVersion).run();
    
    purgeVersionChecked = true;
  } catch (e) {
    console.error('maybePurgeCache error:', e);
  }
}

/**
 * Get Whop settings (LEGACY - redirects to payment_gateways)
 * For backward compatibility with old frontend
 */
export async function getWhopSettings(env) {
  // First try payment_gateways table (new system)
  try {
    const gateway = await env.DB.prepare(
      'SELECT whop_product_id, whop_theme, webhook_secret FROM payment_gateways WHERE gateway_type = ? AND is_enabled = 1 LIMIT 1'
    ).bind('whop').first();

    if (gateway) {
      return json({
        settings: {
          default_product_id: gateway.whop_product_id || '',
          theme: gateway.whop_theme || 'light',
          webhook_secret: gateway.webhook_secret || '',
          // API key from env variable
          api_key: env.WHOP_API_KEY ? '••••••••' : ''
        }
      });
    }
  } catch (e) {
    console.log('Error reading from payment_gateways:', e);
  }

  // Fallback to legacy settings table
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('whop').first();
  if (row && row.value) {
    try {
      const parsed = JSON.parse(row.value);
      return json({ settings: parsed });
    } catch (e) {
      return json({ settings: {} });
    }
  }
  return json({ settings: {} });
}

/**
 * Save Whop settings (LEGACY - saves to payment_gateways)
 * For backward compatibility with old frontend
 */
export async function saveWhopSettings(env, body) {
  const productId = (body.default_product_id || body.product_id || '').trim();
  const theme = (body.theme || 'light').trim();
  const webhookSecret = (body.webhook_secret || '').trim();

  // Check if Whop gateway exists
  const existing = await env.DB.prepare(
    'SELECT id FROM payment_gateways WHERE gateway_type = ? LIMIT 1'
  ).bind('whop').first();

  if (existing) {
    // Update existing gateway
    await env.DB.prepare(`
      UPDATE payment_gateways SET
        whop_product_id = ?,
        whop_theme = ?,
        webhook_secret = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(productId, theme, webhookSecret, existing.id).run();
  } else {
    // Create new Whop gateway
    await env.DB.prepare(`
      INSERT INTO payment_gateways
      (name, gateway_type, webhook_url, webhook_secret, is_enabled, whop_product_id, whop_theme)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind('Whop', 'whop', '/api/whop/webhook', webhookSecret, 1, productId, theme).run();
  }

  // Also save to legacy settings for backward compatibility
  const value = JSON.stringify(body);
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('whop', value).run();

  return json({ success: true });
}

/**
 * Get presigned URL for direct R2 upload (ZERO-CPU Uploads)
 */
export async function getPresignedR2Url(env, url) {
  try {
    if (!env.R2_BUCKET) {
      console.error('R2_BUCKET not configured');
      return json({ error: 'R2 storage not configured' }, 500);
    }

    const sessionId = url.searchParams.get('sessionId');
    const filename = url.searchParams.get('filename');
    const contentType = url.searchParams.get('contentType') || 'application/octet-stream';

    if (!sessionId || !filename) {
      console.error('Missing sessionId or filename');
      return json({ error: 'sessionId and filename required' }, 400);
    }

    // Validate filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `temp/${sessionId}/${sanitizedFilename}`;

    // Validate file type and size limits
    const isVideo = sanitizedFilename.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv)$/);
    const maxSize = isVideo ? 500 * 1024 * 1024 : 10 * 1024 * 1024;
    const maxSizeLabel = isVideo ? '500MB' : '10MB';

    console.log('Generating presigned URL:', sanitizedFilename, 'for session:', sessionId);

    // Generate presigned URL for PUT request (15 minutes expiry)
    const signedUrl = await env.R2_BUCKET.createSignedUrl({
      method: 'PUT',
      expiresIn: 900, // 15 minutes
      key: key,
      headers: {
        'Content-Type': contentType
      }
    });

    // Return the clean URL without query params for the final file URL
    const finalUrl = signedUrl.split('?')[0];

    return json({
      success: true,
      presignedUrl: signedUrl,
      finalUrl: finalUrl,
      key: key,
      maxSize: maxSize,
      maxSizeLabel: maxSizeLabel,
      fileType: isVideo ? 'video' : 'file'
    });
  } catch (err) {
    console.error('Presigned URL generation error:', err);
    return json({
      error: 'Failed to generate upload URL: ' + err.message,
      details: err.stack
    }, 500);
  }
}

/**
 * Get file from R2
 */
export async function getR2File(env, key) {
  if (!env.R2_BUCKET) return json({ error: 'R2 not configured' }, 500);
  
  if (!key) return json({ error: 'key required' }, 400);
  
  const obj = await env.R2_BUCKET.get(key);
  if (!obj) return json({ error: 'File not found' }, 404);
  
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

/**
 * Upload encrypted file for order
 */
export async function uploadEncryptedFile(env, req, url) {
  if (!env.R2_BUCKET) {
    return json({ error: 'R2 not configured' }, 500);
  }
  const orderId = url.searchParams.get('orderId');
  const itemId = url.searchParams.get('itemId');
  const filename = url.searchParams.get('filename');
  if (!orderId || !itemId || !filename) {
    return json({ error: 'orderId, itemId and filename required' }, 400);
  }
  
  const fileBuf = await req.arrayBuffer();
  const key = `orders/${orderId}/${itemId}/${filename}`;
  await env.R2_BUCKET.put(key, fileBuf, {
    httpMetadata: { contentType: req.headers.get('content-type') || 'application/octet-stream' }
  });
  
  return json({ success: true, r2Key: key });
}

/**
 * Handle secure download
 */
export async function handleSecureDownload(env, orderId, baseUrl) {
  const order = await env.DB.prepare(
    'SELECT archive_url, delivered_video_url FROM orders WHERE order_id = ?'
  ).bind(orderId).first();

  const sourceUrl = (order?.delivered_video_url || order?.archive_url || '').toString().trim();

  if (!sourceUrl) {
    return new Response('Download link expired or not found', { status: 404 });
  }

  const lowered = sourceUrl.toLowerCase();
  const openOnly =
    lowered.includes('youtube.com') ||
    lowered.includes('youtu.be') ||
    lowered.includes('vimeo.com') ||
    lowered.includes('iframe.mediadelivery.net/embed/') ||
    lowered.includes('video.bunnycdn.com/play/') ||
    (lowered.includes('archive.org/details/') && !lowered.includes('/download/'));

  if (openOnly) {
    return Response.redirect(sourceUrl, 302);
  }

  const fileResp = await fetch(sourceUrl);
  if (!fileResp.ok) {
    return new Response('File not available', { status: 404 });
  }

  const srcUrl = new URL(sourceUrl, baseUrl);
  let filename = srcUrl.pathname.split('/').pop() || 'video.mp4';
  try {
    filename = decodeURIComponent(filename);
  } catch (_) {}
  filename = filename.replace(/"/g, '');

  const contentTypeHeader = (fileResp.headers.get('content-type') || '').split(';')[0].trim();
  const contentType = contentTypeHeader || getMimeTypeFromFilename(filename) || 'application/octet-stream';

  const headers = new Headers({ ...CORS });
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  const contentLength = fileResp.headers.get('content-length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  return new Response(fileResp.body, {
    status: 200,
    headers
  });
}
