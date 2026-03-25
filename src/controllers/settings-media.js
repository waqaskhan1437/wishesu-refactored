/**
 * Settings media controller
 * Admin uploads MP4 files to R2 and receives direct public links.
 */

import { json } from '../utils/response.js';
import { sanitizeFilename } from '../utils/upload-helper.js';
import { isAdminAuthed } from '../utils/auth.js';

const TABLE_NAME = 'settings_media_uploads';
const MAX_MP4_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

function buildPublicMediaUrl(origin, id, filename) {
  const safeName = String(filename || 'video.mp4');
  return `${origin}/api/r2/settings-media/${id}/${encodeURIComponent(safeName)}`;
}

function normalizeFilename(input) {
  const cleaned = sanitizeFilename(input || 'video.mp4');
  if (!cleaned) return 'video.mp4';
  return /\.mp4$/i.test(cleaned) ? cleaned : `${cleaned}.mp4`;
}

async function ensureMediaTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      r2_key TEXT NOT NULL UNIQUE,
      size_bytes INTEGER DEFAULT 0,
      content_type TEXT DEFAULT 'video/mp4',
      uploaded_at INTEGER NOT NULL
    )
  `).run();

  const columns = [
    ['filename', "TEXT DEFAULT 'video.mp4'"],
    ['r2_key', "TEXT DEFAULT ''"],
    ['size_bytes', 'INTEGER DEFAULT 0'],
    ['content_type', "TEXT DEFAULT 'video/mp4'"],
    ['uploaded_at', 'INTEGER DEFAULT 0']
  ];

  for (const [column, definition] of columns) {
    try {
      await env.DB.prepare(
        `ALTER TABLE ${TABLE_NAME} ADD COLUMN ${column} ${definition}`
      ).run();
    } catch (_) {
      // Column already exists.
    }
  }
}

async function requireAdmin(req, env) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const ok = await isAdminAuthed(req, env);
  if (!ok) return json({ error: 'Unauthorized' }, 401);
  return null;
}

function parseMediaId(idRaw) {
  const id = parseInt(String(idRaw || ''), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export async function uploadSettingsMediaFile(env, req, url) {
  try {
    if (!env.R2_BUCKET) {
      return json({ error: 'R2 storage not configured' }, 500);
    }

    const authError = await requireAdmin(req, env);
    if (authError) return authError;

    await ensureMediaTable(env);

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return json({ error: 'MP4 file is required' }, 400);
    }

    const rawName = String(file.name || 'video.mp4');
    const filename = normalizeFilename(rawName);

    if (!/\.mp4$/i.test(filename)) {
      return json({ error: 'Only .mp4 files are allowed' }, 400);
    }

    const sizeBytes = Number(file.size || 0);
    if (!sizeBytes) {
      return json({ error: 'Selected file is empty' }, 400);
    }
    if (sizeBytes > MAX_MP4_SIZE_BYTES) {
      return json({ error: 'File too large. Maximum size is 500MB.' }, 400);
    }

    const body = await file.arrayBuffer();
    const now = Date.now();
    const randomPart = (typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${now}`;
    const key = `settings-media/${now}-${randomPart}/${filename}`;

    await env.R2_BUCKET.put(key, body, {
      httpMetadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    const insertResult = await env.DB.prepare(`
      INSERT INTO ${TABLE_NAME} (filename, r2_key, size_bytes, content_type, uploaded_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      filename,
      key,
      sizeBytes,
      'video/mp4',
      now
    ).run();

    let id = parseMediaId(insertResult?.meta?.last_row_id);
    if (!id) {
      const row = await env.DB.prepare(
        `SELECT id FROM ${TABLE_NAME} WHERE r2_key = ?`
      ).bind(key).first();
      id = parseMediaId(row?.id);
    }

    if (!id) {
      return json({ error: 'Upload saved but could not resolve media id' }, 500);
    }

    const publicUrl = buildPublicMediaUrl(url.origin, id, filename);
    return json({
      success: true,
      item: {
        id,
        filename,
        size_bytes: sizeBytes,
        uploaded_at: now,
        public_url: publicUrl
      },
      last_link: publicUrl
    });
  } catch (e) {
    return json({ error: e.message || 'Upload failed' }, 500);
  }
}

export async function listSettingsMediaFiles(env, req, url) {
  try {
    const authError = await requireAdmin(req, env);
    if (authError) return authError;

    await ensureMediaTable(env);
    const result = await env.DB.prepare(`
      SELECT id, filename, size_bytes, content_type, uploaded_at
      FROM ${TABLE_NAME}
      ORDER BY uploaded_at DESC
      LIMIT 300
    `).all();

    const items = (result.results || []).map((row) => ({
      id: row.id,
      filename: row.filename,
      size_bytes: Number(row.size_bytes || 0),
      content_type: row.content_type || 'video/mp4',
      uploaded_at: Number(row.uploaded_at || 0),
      public_url: buildPublicMediaUrl(url.origin, row.id, row.filename)
    }));

    return json({
      success: true,
      last_link: items.length > 0 ? items[0].public_url : '',
      items
    });
  } catch (e) {
    return json({ error: e.message || 'Failed to fetch uploads' }, 500);
  }
}

export async function deleteSettingsMediaFile(env, req, url) {
  try {
    const authError = await requireAdmin(req, env);
    if (authError) return authError;

    await ensureMediaTable(env);
    const id = parseMediaId(url.searchParams.get('id'));
    if (!id) return json({ error: 'Valid id is required' }, 400);

    const row = await env.DB.prepare(
      `SELECT id, filename, r2_key FROM ${TABLE_NAME} WHERE id = ?`
    ).bind(id).first();

    if (!row) return json({ error: 'Upload not found' }, 404);

    if (env.R2_BUCKET && row.r2_key) {
      await env.R2_BUCKET.delete(row.r2_key).catch(() => null);
    }

    await env.DB.prepare(
      `DELETE FROM ${TABLE_NAME} WHERE id = ?`
    ).bind(id).run();

    return json({
      success: true,
      deleted: {
        id,
        filename: row.filename
      }
    });
  } catch (e) {
    return json({ error: e.message || 'Delete failed' }, 500);
  }
}

export async function getPublicSettingsMediaFile(env, id) {
  try {
    if (!env.R2_BUCKET) return json({ error: 'R2 storage not configured' }, 500);
    await ensureMediaTable(env);

    const mediaId = parseMediaId(id);
    if (!mediaId) return json({ error: 'Invalid media id' }, 400);

    const row = await env.DB.prepare(
      `SELECT filename, r2_key, content_type FROM ${TABLE_NAME} WHERE id = ?`
    ).bind(mediaId).first();

    if (!row || !row.r2_key) return json({ error: 'File not found' }, 404);

    const obj = await env.R2_BUCKET.get(row.r2_key);
    if (!obj) return json({ error: 'File not found' }, 404);

    const headers = new Headers();
    headers.set('Content-Type', obj.httpMetadata?.contentType || row.content_type || 'video/mp4');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Disposition', `inline; filename="${String(row.filename || `video-${mediaId}.mp4`).replace(/"/g, '')}"`);

    return new Response(obj.body, { status: 200, headers });
  } catch (e) {
    return json({ error: e.message || 'Failed to fetch file' }, 500);
  }
}
