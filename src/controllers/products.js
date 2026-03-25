/**
 * Products controller - Product CRUD operations
 * OPTIMIZED: Added in-memory caching for frequently accessed products
 * COLD START FIX: Added product slug cache to reduce redirect DB queries
 */

import { json, cachedJson } from '../utils/response.js';
import { slugifyStr, toISO8601 } from '../utils/formatting.js';
import { buildPublicProductStatusWhere, getProductTableColumns } from '../utils/product-visibility.js';

// In-memory cache for products list (reduces DB queries)
let productsCache = null;
let productsCacheTime = 0;
const PRODUCTS_CACHE_TTL = 30000; // 30 seconds

// Product slug cache for fast redirects (reduces cold start DB queries)
const productSlugCache = new Map();
const SLUG_CACHE_TTL = 300000; // 5 minutes

async function getProductTimestampSupport(env) {
  const columns = await getProductTableColumns(env);
  return {
    hasCreatedAt: columns.has('created_at'),
    hasUpdatedAt: columns.has('updated_at')
  };
}

function toCleanString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function stripUrlQueryHash(raw) {
  const s = toCleanString(raw);
  if (!s) return '';
  // Avoid URL() here to preserve relative URLs as-is.
  return s.split('#')[0].split('?')[0];
}

function isBadMediaValue(raw) {
  const s = stripUrlQueryHash(raw).toLowerCase();
  if (!s) return true;
  if (s === 'null' || s === 'undefined' || s === 'false' || s === 'true' || s === '0') return true;
  return false;
}

function isLikelyVideoUrl(raw) {
  const s = stripUrlQueryHash(raw).toLowerCase();
  if (!s) return false;
  if (s.includes('youtube.com') || s.includes('youtu.be')) return true;
  return /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|m3u8|mpd)(?:$)/i.test(s);
}

function isLikelyImageUrl(raw) {
  const s = toCleanString(raw).toLowerCase();
  if (!s) return false;
  if (s.startsWith('data:image/')) return true;
  if (s.startsWith('/')) return true;
  if (s.startsWith('http://') || s.startsWith('https://')) return true;
  if (s.startsWith('//')) return true;
  return false;
}

function coerceGalleryArray(value) {
  if (Array.isArray(value)) return value;
  const s = toCleanString(value);
  if (!s) return [];

  // Allow JSON array string.
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  // Accept comma-separated list as a fallback.
  if (s.includes(',')) {
    return s.split(',').map(v => toCleanString(v)).filter(Boolean);
  }

  // Single URL string
  return [s];
}

function normalizeGalleryImages(body) {
  const raw = body && (body.gallery_images ?? body.gallery_urls);
  const input = coerceGalleryArray(raw);

  const normalizedMainThumb = stripUrlQueryHash(body?.thumbnail_url || '');
  const normalizedVideo = stripUrlQueryHash(body?.video_url || '');

  const seen = new Set();
  const out = [];

  for (const item of input) {
    const url = toCleanString(item);
    if (isBadMediaValue(url)) continue;
    if (isLikelyVideoUrl(url)) continue;
    if (!isLikelyImageUrl(url)) continue;

    const normalized = stripUrlQueryHash(url);
    if (!normalized) continue;
    if (normalizedMainThumb && normalized === normalizedMainThumb) continue;
    if (normalizedVideo && normalized === normalizedVideo) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    out.push(url);
    // Hard cap to keep payloads sane.
    if (out.length >= 50) break;
  }

  return out;
}

/**
 * Get active products (public)
 * OPTIMIZED: Single JOIN query + Pagination Support
 */
export async function getProducts(env, url) {
  // Parsing pagination params
  const params = url ? new URL(url).searchParams : { get: () => null };
  const page = parseInt(params.get('page')) || 1;
  // logic: if limit explicitly provided, use it. if not, use 1000 (legacy mode)
  const limitStr = params.get('limit');
  const limit = limitStr ? parseInt(limitStr) : 1000;
  const offset = (page - 1) * limit;
  const filter = params.get('filter') || 'all';

  // Cache key based on params
  const now = Date.now();

  // Return cached data ONLY if no specific limit/filter provided (default view)
  if (!limitStr && filter === 'all' && productsCache && (now - productsCacheTime) < PRODUCTS_CACHE_TTL) {
    return cachedJson({ products: productsCache, pagination: { page: 1, limit: 1000, total: productsCache.length, pages: 1 } }, 120);
  }

  // Build Query
  let whereClause = `WHERE ${buildPublicProductStatusWhere('p.status')}`;
  if (filter === 'featured') {
    whereClause += " AND p.featured = 1";
  }

  // Get Total Count
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM products p ${whereClause}`).first();
  const total = totalRow?.count || 0;

  const r = await env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.normal_price, p.sale_price,
      p.thumbnail_url, p.normal_delivery_text, p.instant_delivery,
      p.featured,
      (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
      (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
    FROM products p
    ${whereClause}
    ORDER BY p.sort_order ASC, p.id DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const products = (r.results || []).map(product => ({
    ...product,
    delivery_time_days: parseInt(product.normal_delivery_text) || 1,
    review_count: product.review_count || 0,
    rating_average: product.rating_average ? Math.round(product.rating_average * 10) / 10 : 0
  }));

  // Update legacy cache if this was a default request
  if (!limitStr && filter === 'all') {
    productsCache = products;
    productsCacheTime = Date.now();
  }

  // Cache for 2 minutes on edge
  return cachedJson({
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  }, 120);
}

/**
 * Get all products (admin)
 */
export async function getProductsList(env) {
  const r = await env.DB.prepare(
    'SELECT id, title, slug, normal_price, sale_price, thumbnail_url, normal_delivery_text, instant_delivery, status FROM products ORDER BY id DESC'
  ).all();
  
  const products = (r.results || []).map(product => ({
    ...product,
    delivery_time_days: parseInt(product.normal_delivery_text) || 1
  }));
  
  return json({ products });
}

/**
 * Get single product by ID or slug
 * OPTIMIZED: Uses Promise.all for parallel queries
 */
export async function getProduct(env, id, opts = {}) {
  const includeHidden = !!opts.includeHidden;
  const visibilitySql = includeHidden ? '' : ` AND ${buildPublicProductStatusWhere('status')}`;
  let row;
  if (isNaN(Number(id))) {
    row = await env.DB.prepare(`SELECT * FROM products WHERE slug = ?${visibilitySql}`).bind(id).first();
  } else {
    row = await env.DB.prepare(`SELECT * FROM products WHERE id = ?${visibilitySql}`).bind(Number(id)).first();
  }
  if (!row) return json({ error: 'Product not found' }, 404);
  
  let addons = [];
  try {
    addons = JSON.parse(row.addons_json || '[]');
  } catch(e) {
    console.error('Failed to parse addons_json for product', row.id, ':', e.message);
  }
  
  // OPTIMIZED: Run stats and reviews queries in parallel
  const [stats, reviewsResult] = await Promise.all([
    env.DB.prepare(
      'SELECT COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE product_id = ? AND status = ?'
    ).bind(row.id, 'approved').first(),
    env.DB.prepare(
      `SELECT reviews.*,
              -- Prefer review overrides first; fall back to order delivery links
              COALESCE(reviews.delivered_video_url, orders.delivered_video_url) as delivered_video_url,
              COALESCE(reviews.delivered_thumbnail_url, orders.delivered_thumbnail_url) as delivered_thumbnail_url,
              orders.delivered_video_metadata
       FROM reviews 
       LEFT JOIN orders ON reviews.order_id = orders.order_id 
       WHERE reviews.product_id = ? AND reviews.status = ? 
       ORDER BY reviews.created_at DESC`
    ).bind(row.id, 'approved').all()
  ]);

  // Convert created_at to ISO 8601 format
  const reviews = (reviewsResult.results || []).map(review => {
    if (review.created_at && typeof review.created_at === 'string') {
      review.created_at = toISO8601(review.created_at);
    }
    if (review.updated_at && typeof review.updated_at === 'string') {
      review.updated_at = toISO8601(review.updated_at);
    }
    return review;
  });
  
  // Extract delivery_time_days from normal_delivery_text (stores days as number string)
  const deliveryTimeDays = parseInt(row.normal_delivery_text) || 1;
  
  return json({
    product: {
      ...row,
      delivery_time_days: deliveryTimeDays,
      addons,
      review_count: stats?.cnt || 0,
      rating_average: stats?.avg ? Math.round(stats.avg * 10) / 10 : 5.0,
      reviews: reviews
    },
    addons
  });
}

/**
 * Save product (create or update)
 */
export async function saveProduct(env, body) {
  const title = (body.title || '').trim();
  if (!title) return json({ error: 'Title required' }, 400);
  
  // Invalidate products cache
  productsCache = null;
  productsCacheTime = 0;
  
  const slug = (body.slug || '').trim() || slugifyStr(title);
  const addonsJson = JSON.stringify(body.addons || []);
  const galleryJson = JSON.stringify(normalizeGalleryImages(body));
  const { hasCreatedAt, hasUpdatedAt } = await getProductTimestampSupport(env);
  
  if (body.id) {
    // Store delivery_time_days in normal_delivery_text field as days number
    const deliveryDays = body.delivery_time_days || body.normal_delivery_text || '1';
    
    await env.DB.prepare(`
      UPDATE products SET title=?, slug=?, description=?, normal_price=?, sale_price=?,
      instant_delivery=?, normal_delivery_text=?, thumbnail_url=?, video_url=?,
      gallery_images=?, addons_json=?, seo_title=?, seo_description=?, seo_keywords=?, seo_canonical=?,
      whop_plan=?, whop_price_map=?, whop_product_id=?${hasUpdatedAt ? ', updated_at=CURRENT_TIMESTAMP' : ''} WHERE id=?
    `).bind(
      title, slug, body.description || '', Number(body.normal_price) || 0, body.sale_price ? Number(body.sale_price) : null,
      body.instant_delivery ? 1 : 0, String(deliveryDays),
      body.thumbnail_url || '', body.video_url || '', galleryJson, addonsJson,
      body.seo_title || '', body.seo_description || '', body.seo_keywords || '', body.seo_canonical || '',
      body.whop_plan || '', body.whop_price_map || '', body.whop_product_id || '', Number(body.id)
    ).run();
    return json({ success: true, id: body.id, slug, url: `/product-${body.id}/${encodeURIComponent(slug)}` });
  }
  
  // Store delivery_time_days in normal_delivery_text field as days number
  const deliveryDays = body.delivery_time_days || body.normal_delivery_text || '1';
  
  const r = await env.DB.prepare(`
    INSERT INTO products (title, slug, description, normal_price, sale_price,
    instant_delivery, normal_delivery_text, thumbnail_url, video_url,
    gallery_images, addons_json, seo_title, seo_description, seo_keywords, seo_canonical,
    whop_plan, whop_price_map, whop_product_id, status, sort_order${hasCreatedAt ? ', created_at' : ''}${hasUpdatedAt ? ', updated_at' : ''})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0${hasCreatedAt ? ', CURRENT_TIMESTAMP' : ''}${hasUpdatedAt ? ', CURRENT_TIMESTAMP' : ''})
  `).bind(
    title, slug, body.description || '', Number(body.normal_price) || 0, body.sale_price ? Number(body.sale_price) : null,
    body.instant_delivery ? 1 : 0, String(deliveryDays),
    body.thumbnail_url || '', body.video_url || '', galleryJson, addonsJson,
    body.seo_title || '', body.seo_description || '', body.seo_keywords || '', body.seo_canonical || '',
    body.whop_plan || '', body.whop_price_map || '', body.whop_product_id || ''
  ).run();
  const newId = r.meta?.last_row_id;
  return json({ success: true, id: newId, slug, url: `/product-${newId}/${encodeURIComponent(slug)}` });
}

/**
 * Delete product
 */
export async function deleteProduct(env, id) {
  if (!id) return json({ error: 'ID required' }, 400);
  
  // Invalidate products cache
  productsCache = null;
  productsCacheTime = 0;
  
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(Number(id)).run();
  return json({ success: true });
}

/**
 * Delete all products (admin cleanup)
 */
export async function deleteAllProducts(env) {
  try {
    // Invalidate products cache
    productsCache = null;
    productsCacheTime = 0;

    const result = await env.DB.prepare('DELETE FROM products').run();
    return json({ success: true, count: result?.changes || 0 });
  } catch (err) {
    return json({ error: err.message || 'Failed to delete all products' }, 500);
  }
}

/**
 * Update product status
 */
export async function updateProductStatus(env, body) {
  const id = body.id;
  const status = (body.status || '').trim().toLowerCase();
  if (!id || !status) {
    return json({ error: 'id and status required' }, 400);
  }
  if (status !== 'active' && status !== 'draft') {
    return json({ error: 'invalid status' }, 400);
  }
  
  // Invalidate products cache
  productsCache = null;
  productsCacheTime = 0;
  const { hasUpdatedAt } = await getProductTimestampSupport(env);
  
  await env.DB.prepare(
    `UPDATE products SET status = ?${hasUpdatedAt ? ', updated_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`
  ).bind(status, Number(id)).run();
  return json({ success: true });
}

/**
 * Duplicate product
 */
export async function duplicateProduct(env, body) {
  const id = body.id;
  if (!id) {
    return json({ error: 'id required' }, 400);
  }
  const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(Number(id)).first();
  if (!row) {
    return json({ error: 'Product not found' }, 404);
  }
  const baseSlug = row.slug || slugifyStr(row.title);
  let newSlug = baseSlug + '-copy';
  let idx = 1;
  let exists = await env.DB.prepare('SELECT slug FROM products WHERE slug = ?').bind(newSlug).first();
  while (exists) {
    newSlug = `${baseSlug}-copy${idx}`;
    idx++;
    exists = await env.DB.prepare('SELECT slug FROM products WHERE slug = ?').bind(newSlug).first();
  }
  const { hasCreatedAt, hasUpdatedAt } = await getProductTimestampSupport(env);
  
  const r = await env.DB.prepare(
    `INSERT INTO products (
      title, slug, description, normal_price, sale_price,
      instant_delivery, normal_delivery_text, thumbnail_url, video_url,
      addons_json, seo_title, seo_description, seo_keywords, seo_canonical,
      whop_plan, whop_price_map, whop_product_id, status, sort_order${hasCreatedAt ? ', created_at' : ''}${hasUpdatedAt ? ', updated_at' : ''}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasCreatedAt ? ', CURRENT_TIMESTAMP' : ''}${hasUpdatedAt ? ', CURRENT_TIMESTAMP' : ''})`
  ).bind(
    (row.title || '') + ' Copy',
    newSlug,
    row.description || '',
    row.normal_price || 0,
    row.sale_price || null,
    row.instant_delivery || 0,
    row.normal_delivery_text || '',
    row.thumbnail_url || '',
    row.video_url || '',
    row.addons_json || '[]',
    row.seo_title || '',
    row.seo_description || '',
    row.seo_keywords || '',
    row.seo_canonical || '',
    row.whop_plan || '',
    row.whop_price_map || '',
    row.whop_product_id || '',
    'draft',
    0
  ).run();
  return json({ success: true, id: r.meta?.last_row_id, slug: newSlug });
}

/**
 * Get adjacent products (next/previous) for navigation
 * OPTIMIZED: Uses Promise.all for parallel queries
 */
export async function getAdjacentProducts(env, id) {
  const productId = Number(id);
  if (!productId) return json({ error: 'Product ID required' }, 400);
  
  // Get current product's sort_order
  const current = await env.DB.prepare(
    `SELECT id, sort_order FROM products WHERE id = ? AND ${buildPublicProductStatusWhere('status')}`
  ).bind(productId).first();
  
  if (!current) return json({ error: 'Product not found' }, 404);
  
  // OPTIMIZED: Run prev and next queries in parallel
  const [prev, next] = await Promise.all([
    // Get previous product (higher sort_order or lower id if same sort_order)
    env.DB.prepare(`
      SELECT id, title, slug, thumbnail_url 
      FROM products 
      WHERE ${buildPublicProductStatusWhere('status')} 
      AND (
        sort_order < ? 
        OR (sort_order = ? AND id > ?)
      )
      ORDER BY sort_order DESC, id ASC
      LIMIT 1
    `).bind(current.sort_order, current.sort_order, productId).first(),
    // Get next product (lower sort_order or higher id if same sort_order)
    env.DB.prepare(`
      SELECT id, title, slug, thumbnail_url 
      FROM products 
      WHERE ${buildPublicProductStatusWhere('status')} 
      AND (
        sort_order > ? 
        OR (sort_order = ? AND id < ?)
      )
      ORDER BY sort_order ASC, id DESC
      LIMIT 1
    `).bind(current.sort_order, current.sort_order, productId).first()
  ]);
  
  return json({
    previous: prev ? {
      id: prev.id,
      title: prev.title,
      slug: prev.slug,
      thumbnail_url: prev.thumbnail_url,
      url: `/product-${prev.id}/${encodeURIComponent(prev.slug || '')}`
    } : null,
    next: next ? {
      id: next.id,
      title: next.title,
      slug: next.slug,
      thumbnail_url: next.thumbnail_url,
      url: `/product-${next.id}/${encodeURIComponent(next.slug || '')}`
    } : null
  });
}

/**
 * Handle product routing (canonical URLs and redirects)
 * OPTIMIZED: Uses in-memory cache to reduce DB queries on cold start
 */
export async function handleProductRouting(env, url, path) {
  const now = Date.now();

  // Helper to get product from cache or DB
  async function getProductById(id) {
    const cacheKey = `id:${id}`;
    const cached = productSlugCache.get(cacheKey);
    if (cached && (now - cached.time) < SLUG_CACHE_TTL) {
      return cached.data;
    }
    const p = await env.DB.prepare('SELECT id, title, slug FROM products WHERE id = ? LIMIT 1').bind(Number(id)).first();
    if (p) {
      productSlugCache.set(cacheKey, { data: p, time: now });
    }
    return p;
  }

  async function getProductBySlug(slug) {
    const cacheKey = `slug:${slug}`;
    const cached = productSlugCache.get(cacheKey);
    if (cached && (now - cached.time) < SLUG_CACHE_TTL) {
      return cached.data;
    }
    const p = await env.DB.prepare('SELECT id, title, slug FROM products WHERE slug = ? LIMIT 1').bind(slug).first();
    if (p) {
      productSlugCache.set(cacheKey, { data: p, time: now });
      productSlugCache.set(`id:${p.id}`, { data: p, time: now });
    }
    return p;
  }

  /*
   * Legacy handling (removed redirects)
   *
   * Historically we supported two legacy product URL formats:
   *   1. /product?id=123  → canonical slug path `/product-123/<slug>`
   *   2. /product/<slug>  → canonical slug path `/product-<id>/<slug>`
   *
   * These patterns are still recognized here so that any missing slug is normalized
   * in the database. However, we no longer redirect the visitor to the canonical
   * path. Returning null here allows the router to continue and either serve
   * the canonical HTML page directly (via `/product-<id>/<slug>`) or yield
   * a 404 if no matching route exists. This ensures there are no intermediate
   * HTTP redirects and the DB slug remains the same as the user-facing URL.
   */

  // Handle legacy /product?id=123 by ensuring slug exists in DB
  const legacyId = (path === '/product') ? url.searchParams.get('id') : null;
  if (legacyId) {
    const p = await getProductById(legacyId);
    if (p) {
      // Slug normalization removed: product slugs should be assigned
      // when the product is created or updated via the admin panel.
      // We avoid updating the DB on each legacy request to reduce CPU
      // and DB usage on edge.
      // We intentionally do not redirect. Returning null allows the request
      // to fall through to normal route handling (typically 404 for /product).
      return null;
    }
  }

  // Handle legacy /product/<slug> by ensuring slug exists in DB
  if (path.startsWith('/product/') && path.length > '/product/'.length) {
    const slugIn = decodeURIComponent(path.slice('/product/'.length));
    const row = await getProductBySlug(slugIn);
    if (row) {
      // Slug normalization removed: if the product has no slug, it will be
      // generated and saved during product creation/update. Avoid hitting the DB
      // here to reduce CPU usage.
      // Again, do not redirect to canonical path. Let the router handle the
      // current URL as-is. Users should navigate directly to `/product-<id>/<slug>`.
      return null;
    }
  }

  return null;
}
