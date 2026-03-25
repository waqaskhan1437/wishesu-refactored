/**
 * Pages controller - Dynamic page management
 * OPTIMIZED: Added edge caching for public endpoints
 */

import { json, cachedJson } from '../utils/response.js';
import { toISO8601 } from '../utils/formatting.js';

// Page type constants
const PAGE_TYPES = {
  CUSTOM: 'custom',
  HOME: 'home',
  BLOG_ARCHIVE: 'blog_archive',
  FORUM_ARCHIVE: 'forum_archive',
  PRODUCT_GRID: 'product_grid'
};

function sanitizePageSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function isTruthyDefault(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isRootHomePage(pageType, isDefault) {
  return String(pageType || '') === PAGE_TYPES.HOME && Number(isDefault) === 1;
}

async function getUniquePageSlug(env, baseSlug, excludeId = null) {
  let base = sanitizePageSlug(baseSlug || 'page');
  if (!base || base === 'home') base = 'page';

  let candidate = base;
  let counter = 1;
  while (true) {
    const row = excludeId
      ? await env.DB.prepare('SELECT id FROM pages WHERE slug = ? AND id != ? LIMIT 1').bind(candidate, Number(excludeId)).first()
      : await env.DB.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1').bind(candidate).first();
    if (!row) return candidate;
    candidate = `${base}-${counter++}`;
  }
}

async function freeHomeSlugForPage(env, targetId = null) {
  const query = targetId
    ? 'SELECT id, title FROM pages WHERE slug = ? AND id != ? ORDER BY id DESC'
    : 'SELECT id, title FROM pages WHERE slug = ? ORDER BY id DESC';
  const bind = targetId ? [ 'home', Number(targetId) ] : [ 'home' ];
  const rows = await env.DB.prepare(query).bind(...bind).all();

  for (const row of rows.results || []) {
    const base = sanitizePageSlug(row.title || '') || 'home-page';
    const nextSlug = await getUniquePageSlug(env, `${base}-previous`, row.id);
    await env.DB.prepare(
      'UPDATE pages SET slug = ?, is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(nextSlug, Number(row.id)).run();
  }
}

/**
 * Get active pages (public - cached)
 */
export async function getPages(env) {
  const r = await env.DB.prepare(
    'SELECT id, slug, title, meta_description, page_type, is_default, created_at, updated_at FROM pages WHERE status = ? ORDER BY id DESC'
  ).bind('published').all();
  
  const pages = (r.results || []).map(page => {
    if (page.created_at) page.created_at = toISO8601(page.created_at);
    if (page.updated_at) page.updated_at = toISO8601(page.updated_at);
    return page;
  });

  // Cache for 2 minutes
  return cachedJson({ pages }, 120);
}

/**
 * Get all pages (admin) - Returns format expected by dashboard.js
 * Maps to: { name, url, size, uploaded, id, status, page_type, is_default }
 */
export async function getPagesList(env) {
  let r;
  let hasNewColumns = true;
  
  try {
    r = await env.DB.prepare(
      'SELECT id, slug, title, content, status, page_type, is_default, created_at, updated_at FROM pages ORDER BY id DESC'
    ).all();
  } catch (e) {
    // Fallback: new columns don't exist
    hasNewColumns = false;
    r = await env.DB.prepare(
      'SELECT id, slug, title, content, status, created_at, updated_at FROM pages ORDER BY id DESC'
    ).all();
  }
  
  const pages = (r.results || []).map(page => {
    // Calculate approximate size of content
    const contentSize = page.content ? page.content.length : 0;
    
    // Format size for display
    let sizeStr = '0 B';
    if (contentSize >= 1024 * 1024) {
      sizeStr = (contentSize / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (contentSize >= 1024) {
      sizeStr = (contentSize / 1024).toFixed(2) + ' KB';
    } else {
      sizeStr = contentSize + ' B';
    }
    
    // Convert datetime to ISO format
    const uploaded = page.updated_at 
      ? toISO8601(page.updated_at) 
      : (page.created_at ? toISO8601(page.created_at) : new Date().toISOString());
    
    const pageType = hasNewColumns ? (page.page_type || 'custom') : 'custom';
    const isDefault = hasNewColumns ? (page.is_default || 0) : 0;
    const publicUrl = isRootHomePage(pageType, isDefault) ? '/' : `/${page.slug}`;

    return {
      id: page.id,
      name: page.slug || page.title || 'Untitled',
      title: page.title || page.slug || 'Untitled',
      url: publicUrl,
      size: sizeStr,
      uploaded: uploaded,
      status: page.status || 'draft',
      page_type: pageType,
      is_default: isDefault
    };
  });

  return json({ success: true, pages });
}

/**
 * Get page by slug
 */
export async function getPage(env, slug) {
  const row = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
  if (!row) return json({ error: 'Page not found' }, 404);

  if (row.created_at) row.created_at = toISO8601(row.created_at);
  if (row.updated_at) row.updated_at = toISO8601(row.updated_at);

  return json({ page: row });
}

/**
 * Get default page by type
 */
export async function getDefaultPage(env, pageType) {
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM pages WHERE page_type = ? AND is_default = 1 AND status = ?'
    ).bind(pageType, 'published').first();
    
    if (!row) return json({ page: null });
    
    if (row.created_at) row.created_at = toISO8601(row.created_at);
    if (row.updated_at) row.updated_at = toISO8601(row.updated_at);
    row.public_url = isRootHomePage(row.page_type, row.is_default) ? '/' : `/${row.slug}`;

    return json({ page: row });
  } catch (e) {
    // Columns might not exist yet
    return json({ page: null });
  }
}

/**
 * Set page as default for its type
 */
export async function setDefaultPage(env, body) {
  const { id, page_type } = body;

  if (!id || !page_type) {
    return json({ error: 'id and page_type required' }, 400);
  }

  try {
    // First, unset any existing default for this type
    await env.DB.prepare(
      'UPDATE pages SET is_default = 0 WHERE page_type = ?'
    ).bind(page_type).run();

    if (String(page_type) === PAGE_TYPES.HOME) {
      await freeHomeSlugForPage(env, Number(id));
      await env.DB.prepare(
        'UPDATE pages SET slug = ?, is_default = 1, page_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind('home', page_type, Number(id)).run();
    } else {
      // Then set the new default
      await env.DB.prepare(
        'UPDATE pages SET is_default = 1, page_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(page_type, Number(id)).run();
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: 'Columns not available. Please redeploy to add page_type support.' }, 500);
  }
}

/**
 * Clear default page for a type
 */
export async function clearDefaultPage(env, body) {
  const { page_type } = body;
  
  if (!page_type) {
    return json({ error: 'page_type required' }, 400);
  }
  
  await env.DB.prepare(
    'UPDATE pages SET is_default = 0 WHERE page_type = ?'
  ).bind(page_type).run();
  
  return json({ success: true });
}

/**
 * Save page (create or update)
 */
export async function savePage(env, body) {
  if (!body.title) return json({ error: 'title required' }, 400);

  const pageType = body.page_type || 'custom';
  // Only set as default when explicitly requested by the client UI.
  // Previously, any non-custom page_type would auto-become default, which caused
  // the latest-saved page to overwrite the existing default unexpectedly.
  const wantsDefault = isTruthyDefault(body.is_default);
  const isDefault = wantsDefault && pageType !== 'custom' ? 1 : 0;
  const forcedHomeSlug = isRootHomePage(pageType, isDefault);

  // Sanitize or generate slug from provided slug or title. Enforce lower case,
  // hyphens for separators, and trim leading/trailing hyphens. This prevents
  // invalid characters from being stored in the database and ensures URLs
  // remain SEO-friendly.
  const finalSlug = forcedHomeSlug
    ? 'home'
    : sanitizePageSlug(
        body.slug && typeof body.slug === 'string' && body.slug.trim().length > 0
          ? body.slug
          : (body.title || '')
      );
  if (!finalSlug) {
    return json({ error: 'slug could not be generated from title' }, 400);
  }

  const clearDefaultsIfNeeded = async () => {
    if (isDefault && pageType !== 'custom') {
      await env.DB.prepare(
        'UPDATE pages SET is_default = 0 WHERE page_type = ?'
      ).bind(pageType).run();
    }
  };

  const bodyId = Number(body.id);
  const hasValidBodyId = Number.isInteger(bodyId) && bodyId > 0;
  const originalSlug = sanitizePageSlug(body.original_slug || '');

  let updateId = hasValidBodyId ? bodyId : null;
  if (!updateId && originalSlug) {
    const existingByOriginalSlug = await env.DB.prepare(
      'SELECT id FROM pages WHERE slug = ? LIMIT 1'
    ).bind(originalSlug).first();
    if (existingByOriginalSlug && existingByOriginalSlug.id) {
      updateId = Number(existingByOriginalSlug.id);
    }
  }

  if (forcedHomeSlug) {
    await freeHomeSlugForPage(env, updateId);
  }

  // When updating existing page, use the sanitized slug.
  if (updateId) {
    const existingPage = await env.DB.prepare(
      'SELECT id FROM pages WHERE id = ? LIMIT 1'
    ).bind(updateId).first();
    if (!existingPage) {
      return json({ error: 'page not found' }, 404);
    }

    const slugOwner = await env.DB.prepare(
      'SELECT id FROM pages WHERE slug = ? LIMIT 1'
    ).bind(finalSlug).first();
    if (slugOwner && Number(slugOwner.id) !== updateId) {
      return json({ error: 'slug already exists' }, 409);
    }

    await clearDefaultsIfNeeded();

    await env.DB.prepare(
      'UPDATE pages SET slug=?, title=?, content=?, meta_description=?, page_type=?, is_default=?, feature_image_url=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(
      finalSlug,
      body.title,
      body.content || '',
      body.meta_description || '',
      pageType,
      isDefault,
      body.feature_image_url || '',
      body.status || 'published',
      updateId
    ).run();
    return json({ success: true, id: updateId, slug: finalSlug, public_url: forcedHomeSlug ? '/' : `/${finalSlug}` });
  }

  // If no ID but a page with the same slug exists, update it instead of creating a duplicate
  try {
    const existingBySlug = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1').bind(finalSlug).first();
    if (existingBySlug) {
      await clearDefaultsIfNeeded();

      await env.DB.prepare(
        'UPDATE pages SET slug=?, title=?, content=?, meta_description=?, page_type=?, is_default=?, feature_image_url=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(
        finalSlug,
        body.title,
        body.content || '',
        body.meta_description || '',
        pageType,
        isDefault,
        body.feature_image_url || '',
        body.status || 'published',
        existingBySlug.id
      ).run();
      return json({ success: true, id: existingBySlug.id, slug: finalSlug, public_url: forcedHomeSlug ? '/' : `/${finalSlug}` });
    }
  } catch (e) {
    // ignore errors from lookup; fall through to insert below
  }

  // Ensure slug uniqueness for new pages
  let uniqueSlug = finalSlug;
  if (!forcedHomeSlug) {
    let idx = 1;
    while (true) {
      const exists = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1').bind(uniqueSlug).first();
      if (!exists) break;
      uniqueSlug = `${finalSlug}-${idx++}`;
    }
  } else {
    const existingHome = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1').bind('home').first();
    if (existingHome) {
      return json({ error: 'default home page could not claim the home slug' }, 409);
    }
  }

  await clearDefaultsIfNeeded();

  const r = await env.DB.prepare(
    'INSERT INTO pages (slug, title, content, meta_description, page_type, is_default, feature_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(uniqueSlug, body.title, body.content || '', body.meta_description || '', pageType, isDefault, body.feature_image_url || '', body.status || 'published').run();
  return json({ success: true, id: r.meta?.last_row_id, slug: uniqueSlug, public_url: forcedHomeSlug ? '/' : `/${uniqueSlug}` });
}

/**
 * Save page builder (simplified endpoint)
 */
export async function savePageBuilder(env, body) {
  const content = body.content || '';
  const pageType = body.page_type || 'custom';
  // Only set as default when explicitly requested by the client UI.
  const wantsDefault = isTruthyDefault(body.is_default);
  const isDefault = wantsDefault && pageType !== 'custom' ? 1 : 0;
  const forcedHomeSlug = isRootHomePage(pageType, isDefault);
  const name = forcedHomeSlug ? 'home' : sanitizePageSlug((body.name || '').trim());

  if (!name) return json({ error: 'name required' }, 400);

  const clearDefaultsIfNeeded = async () => {
    if (isDefault && pageType !== 'custom') {
      try {
        await env.DB.prepare(
          'UPDATE pages SET is_default = 0 WHERE page_type = ?'
        ).bind(pageType).run();
      } catch (e) {
        // Column might not exist yet, ignore
      }
    }
  };

  const bodyId = Number(body.id);
  const hasValidBodyId = Number.isInteger(bodyId) && bodyId > 0;
  const originalSlug = sanitizePageSlug(body.original_slug || '');
  let existing = null;

  if (hasValidBodyId) {
    existing = await env.DB.prepare('SELECT id FROM pages WHERE id = ?').bind(bodyId).first();
  }
  if (!existing && originalSlug) {
    existing = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(originalSlug).first();
  }
  if (!existing && !forcedHomeSlug) {
    existing = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(name).first();
  }

  if (forcedHomeSlug) {
    await freeHomeSlugForPage(env, existing?.id || null);
  }

  if (existing) {
    const slugOwner = await env.DB.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1').bind(name).first();
    if (slugOwner && Number(slugOwner.id) !== Number(existing.id)) {
      return json({ error: 'slug already exists' }, 409);
    }

    await clearDefaultsIfNeeded();

    // Try with new columns first, fallback to old schema
    try {
      await env.DB.prepare(
        'UPDATE pages SET slug=?, content=?, page_type=?, is_default=?, feature_image_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(name, content, pageType, isDefault, body.feature_image_url || '', existing.id).run();
    } catch (e) {
      // Fallback: columns don't exist, use basic update
      await env.DB.prepare(
        'UPDATE pages SET slug=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(name, content, existing.id).run();
    }
    return json({ success: true, id: existing.id, slug: name, public_url: forcedHomeSlug ? '/' : `/${name}` });
  }

  // If setting as default, clear other defaults first
  await clearDefaultsIfNeeded();

  // Try with new columns first, fallback to old schema
  try {
    const r = await env.DB.prepare(
      'INSERT INTO pages (slug, title, content, page_type, is_default, feature_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, name, content, pageType, isDefault, body.feature_image_url || '', 'published').run();
    return json({ success: true, id: r.meta?.last_row_id, slug: name, public_url: forcedHomeSlug ? '/' : `/${name}` });
  } catch (e) {
    // Fallback: columns don't exist, use basic insert
    const r = await env.DB.prepare(
      'INSERT INTO pages (slug, title, content, status) VALUES (?, ?, ?, ?)'
    ).bind(name, name, content, 'published').run();
    return json({ success: true, id: r.meta?.last_row_id, slug: name, public_url: forcedHomeSlug ? '/' : `/${name}` });
  }
}

/**
 * Delete page by ID
 */
export async function deletePage(env, id) {
  await env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(Number(id)).run();
  return json({ success: true });
}

/**
 * Delete page by slug
 */
export async function deletePageBySlug(env, body) {
  const name = (body.name || '').trim();
  if (!name) return json({ error: 'name required' }, 400);
  
  await env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(name).run();
  return json({ success: true });
}

/**
 * Bulk delete pages (admin cleanup utility)
 * body: { status?: 'all'|'draft'|'published', page_type?: 'all'|PAGE_TYPES }
 */
export async function deleteAllPages(env, body = {}) {
  const status = String(body.status || 'all').trim().toLowerCase();
  const pageType = String(body.page_type || 'all').trim().toLowerCase();

  if (!['all', 'draft', 'published'].includes(status)) {
    return json({ error: 'Invalid status filter. Use all, draft, or published.' }, 400);
  }

  const validPageTypes = new Set(['all', ...Object.values(PAGE_TYPES)]);
  if (!validPageTypes.has(pageType)) {
    return json({ error: 'Invalid page_type filter.' }, 400);
  }

  let query = 'DELETE FROM pages';
  const conditions = [];
  const params = [];

  if (status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (pageType !== 'all') {
    conditions.push('page_type = ?');
    params.push(pageType);
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  try {
    const result = await env.DB.prepare(query).bind(...params).run();
    return json({ success: true, count: result?.changes || 0 });
  } catch (err) {
    const message = String(err?.message || '');
    const pageTypeColumnMissing = /no such column: page_type/i.test(message);

    // Backward compatibility for older schema without page_type column
    if (pageTypeColumnMissing && pageType !== 'all') {
      return json({ error: 'page_type filtering is not available on current schema.' }, 400);
    }
    if (pageTypeColumnMissing) {
      const fallbackQuery = status === 'all' ? 'DELETE FROM pages' : 'DELETE FROM pages WHERE status = ?';
      const fallbackParams = status === 'all' ? [] : [status];
      const fallback = await env.DB.prepare(fallbackQuery).bind(...fallbackParams).run();
      return json({ success: true, count: fallback?.changes || 0 });
    }

    return json({ error: message || 'Failed to delete pages.' }, 500);
  }
}

/**
 * Update page status
 */
export async function updatePageStatus(env, body) {
  const id = body.id;
  const status = (body.status || '').trim().toLowerCase();
  if (!id || !status) {
    return json({ error: 'id and status required' }, 400);
  }
  if (status !== 'published' && status !== 'draft') {
    return json({ error: 'invalid status' }, 400);
  }
  await env.DB.prepare('UPDATE pages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, Number(id)).run();
  return json({ success: true });
}

/**
 * Update page type
 */
export async function updatePageType(env, body) {
  const { id, page_type, is_default } = body;
  
  if (!id || !page_type) {
    return json({ error: 'id and page_type required' }, 400);
  }
  
  const wantsDefault =
    is_default === true ||
    is_default === 1 ||
    is_default === '1' ||
    is_default === 'true';
  const setDefault = wantsDefault ? 1 : 0;
  
  // If setting as default, clear other defaults first
  if (setDefault && page_type !== 'custom') {
    await env.DB.prepare(
      'UPDATE pages SET is_default = 0 WHERE page_type = ?'
    ).bind(page_type).run();
  }
  
  await env.DB.prepare(
    'UPDATE pages SET page_type = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(page_type, setDefault, Number(id)).run();
  
  return json({ success: true });
}

/**
 * Duplicate page
 */
export async function duplicatePage(env, body) {
  const id = body.id;
  if (!id) {
    return json({ error: 'id required' }, 400);
  }
  const row = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(Number(id)).first();
  if (!row) {
    return json({ error: 'Page not found' }, 404);
  }
  
  const baseSlug = row.slug || 'page';
  let newSlug = baseSlug + '-copy';
  let idx = 1;
  let exists = await env.DB.prepare('SELECT slug FROM pages WHERE slug = ?').bind(newSlug).first();
  while (exists) {
    newSlug = `${baseSlug}-copy${idx}`;
    idx++;
    exists = await env.DB.prepare('SELECT slug FROM pages WHERE slug = ?').bind(newSlug).first();
  }
  
  const r = await env.DB.prepare(
    'INSERT INTO pages (slug, title, content, meta_description, page_type, is_default, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    newSlug,
    (row.title || '') + ' Copy',
    row.content || '',
    row.meta_description || '',
    row.page_type || 'custom',
    0, // Never copy default status
    'draft'
  ).run();
  
  return json({ success: true, id: r.meta?.last_row_id, slug: newSlug });
}

/**
 * Load page builder content
 */
export async function loadPageBuilder(env, name) {
  if (!name) return json({ error: 'name required' }, 400);
  
  const row = await env.DB.prepare('SELECT id, slug, content, page_type, is_default, feature_image_url FROM pages WHERE slug = ?').bind(name).first();
  if (!row) return json({ id: null, slug: name, content: '', page_type: 'custom', is_default: 0, feature_image_url: '' });

  return json({
    id: row.id || null,
    slug: row.slug || name,
    content: row.content || '',
    page_type: row.page_type || 'custom',
    is_default: row.is_default || 0,
    feature_image_url: row.feature_image_url || ''
  });
}

/**
 * Serve dynamic page
 */
export async function serveDynamicPage(env, slug) {
  const row = await env.DB.prepare(
    'SELECT * FROM pages WHERE slug = ? AND status = ?'
  ).bind(slug, 'published').first();
  
  if (!row) return null;

  // Return page content with basic HTML wrapper
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${row.title || slug}</title>
  ${row.meta_description ? `<meta name="description" content="${row.meta_description}">` : ''}
  <style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:0;}</style>
</head>
<body>
  ${row.content || ''}
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
