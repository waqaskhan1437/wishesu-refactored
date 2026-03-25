/**
 * Reviews controller - Review management
 * OPTIMIZED: Added validation limits and edge caching
 */

import { json, cachedJson } from '../utils/response.js';
import { toISO8601 } from '../utils/formatting.js';
import { notifyReviewSubmitted } from './webhooks.js';

// Review limits
const REVIEW_LIMITS = {
  author_name: 50,
  comment: 1000,
  rating_min: 1,
  rating_max: 5
};

/**
 * Get reviews with filters (PUBLIC - cached)
 */
export async function getReviews(env, url) {
  const params = url.searchParams;
  // Admin dashboard should not be served cached data.
  // Use /api/reviews?admin=1 to bypass edge/browser caching.
  const isAdminBypassCache = params.get('admin') === '1' || params.get('nocache') === '1';
  const rating = params.get('rating');
  const productId = params.get('productId');
  const productIds = params.get('productIds');
  const ids = params.get('ids');
  
  let sql = 'SELECT r.*, p.title as product_title FROM reviews r LEFT JOIN products p ON r.product_id = p.id WHERE r.status = ?';
  const binds = ['approved'];
  
  // Filter by rating
  if (rating) {
    sql += ' AND r.rating = ?';
    binds.push(Number(rating));
  }
  // Filter by single product
  if (productId) {
    sql += ' AND r.product_id = ?';
    binds.push(Number(productId));
  }
  // Filter by multiple products
  if (productIds) {
    const idsArr = productIds.split(',').map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    if (idsArr.length > 0) {
      sql += ` AND r.product_id IN (${idsArr.map(() => '?').join(',')})`;
      binds.push(...idsArr);
    }
  }
  // Filter by specific review IDs
  if (ids) {
    const idsArr2 = ids.split(',').map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    if (idsArr2.length > 0) {
      sql += ` AND r.id IN (${idsArr2.map(() => '?').join(',')})`;
      binds.push(...idsArr2);
    }
  }
  sql += ' ORDER BY r.created_at DESC';
  
  const stmt = await env.DB.prepare(sql);
  const r = await stmt.bind(...binds).all();

  // Convert created_at to ISO 8601 format
  const reviews = (r.results || []).map(review => {
    if (review.created_at && typeof review.created_at === 'string') {
      review.created_at = toISO8601(review.created_at);
    }
    return review;
  });

  // Cache for 2 minutes - reviews don't change often
  return isAdminBypassCache ? json({ reviews }) : cachedJson({ reviews }, 120);
}

/**
 * Get reviews for a product
 */
export async function getProductReviews(env, productId) {
  const r = await env.DB.prepare(
    `SELECT reviews.*,
            -- Prefer review overrides first; fall back to order delivery links
            COALESCE(reviews.delivered_video_url, orders.delivered_video_url) as delivered_video_url,
            COALESCE(reviews.delivered_thumbnail_url, orders.delivered_thumbnail_url) as delivered_thumbnail_url,
            orders.delivered_video_metadata
     FROM reviews 
     LEFT JOIN orders ON reviews.order_id = orders.order_id 
     WHERE reviews.product_id = ? AND reviews.status = ? 
     ORDER BY reviews.created_at DESC`
  ).bind(Number(productId), 'approved').all();

  // Convert created_at to ISO 8601 format
  const reviews = (r.results || []).map(review => {
    if (review.created_at && typeof review.created_at === 'string') {
      review.created_at = toISO8601(review.created_at);
    }
    return review;
  });

  return json({ reviews });
}

export async function getReviewMigrationStatus(env) {
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_reviews,
      SUM(CASE WHEN delivered_video_url IS NOT NULL AND TRIM(delivered_video_url) != '' THEN 1 ELSE 0 END) AS reviews_with_videos,
      SUM(CASE WHEN delivered_video_url IS NULL OR TRIM(delivered_video_url) = '' THEN 1 ELSE 0 END) AS reviews_without_videos,
      SUM(CASE WHEN order_id IS NOT NULL AND TRIM(order_id) != '' THEN 1 ELSE 0 END) AS reviews_with_orders,
      SUM(CASE
            WHEN order_id IS NOT NULL AND TRIM(order_id) != '' AND (
              delivered_video_url IS NULL OR TRIM(delivered_video_url) = '' OR
              delivered_thumbnail_url IS NULL OR TRIM(delivered_thumbnail_url) = ''
            )
            THEN 1
            ELSE 0
          END) AS eligible_for_migration
    FROM reviews
  `).first();

  return json({
    success: true,
    stats: {
      totalReviews: Number(row?.total_reviews || 0),
      reviewsWithVideos: Number(row?.reviews_with_videos || 0),
      reviewsWithoutVideos: Number(row?.reviews_without_videos || 0),
      reviewsWithOrders: Number(row?.reviews_with_orders || 0),
      eligibleForMigration: Number(row?.eligible_for_migration || 0)
    }
  });
}

export async function migrateReviewMediaFromOrders(env) {
  const result = await env.DB.prepare(`
    UPDATE reviews
       SET delivered_video_url = COALESCE(
             NULLIF(TRIM(delivered_video_url), ''),
             (
               SELECT NULLIF(TRIM(o.delivered_video_url), '')
                 FROM orders o
                WHERE o.order_id = reviews.order_id
                LIMIT 1
             )
           ),
           delivered_thumbnail_url = COALESCE(
             NULLIF(TRIM(delivered_thumbnail_url), ''),
             (
               SELECT NULLIF(TRIM(o.delivered_thumbnail_url), '')
                 FROM orders o
                WHERE o.order_id = reviews.order_id
                LIMIT 1
             )
           )
     WHERE order_id IS NOT NULL
       AND TRIM(order_id) != ''
       AND EXISTS (
             SELECT 1
               FROM orders o
              WHERE o.order_id = reviews.order_id
                AND (
                  NULLIF(TRIM(o.delivered_video_url), '') IS NOT NULL OR
                  NULLIF(TRIM(o.delivered_thumbnail_url), '') IS NOT NULL
                )
           )
       AND (
             delivered_video_url IS NULL OR TRIM(delivered_video_url) = '' OR
             delivered_thumbnail_url IS NULL OR TRIM(delivered_thumbnail_url) = ''
           )
  `).run();

  return json({
    success: true,
    rowsUpdated: Number(result?.meta?.changes || result?.changes || 0)
  });
}

/**
 * Add review
 */
export async function addReview(env, body) {
  if (!body.productId || !body.rating) return json({ error: 'productId and rating required' }, 400);
  
  // Validate and sanitize inputs with defined limits
  const authorName = String(body.author || 'Customer').trim().substring(0, REVIEW_LIMITS.author_name);
  const comment = String(body.comment || '').trim().substring(0, REVIEW_LIMITS.comment);
  const rating = Math.min(REVIEW_LIMITS.rating_max, Math.max(REVIEW_LIMITS.rating_min, parseInt(body.rating) || 5));
  
  // Validate author name
  if (authorName.length < 1) {
    return json({ error: 'Name is required' }, 400);
  }
  
  // Validate comment length
  if (comment.length > 0 && comment.length < 3) {
    return json({ error: 'Comment must be at least 3 characters' }, 400);
  }
  
  await env.DB.prepare(
    'INSERT INTO reviews (product_id, author_name, rating, comment, status, order_id, show_on_product, delivered_video_url, delivered_thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    Number(body.productId), 
    authorName, 
    rating, 
    comment, 
    'approved', 
    body.orderId || null, 
    body.showOnProduct !== undefined ? (body.showOnProduct ? 1 : 0) : 1,
    body.deliveredVideoUrl || null,
    body.deliveredThumbnailUrl || null
  ).run();
  
  // Get product title for notification
  let productTitle = '';
  try {
    const product = await env.DB.prepare('SELECT title FROM products WHERE id = ?').bind(Number(body.productId)).first();
    productTitle = product?.title || '';
  } catch (e) {}
  
  // Notify admin about new review (async)
  notifyReviewSubmitted(env, { productTitle, rating, authorName, comment }).catch(() => {});
  
  return json({ success: true });
}

/**
 * Update review
 */
export async function updateReview(env, body) {
  const id = Number(body.id);
  if (!id) return json({ error: 'Review ID required' }, 400);
  
  // Build dynamic update query with validation
  const updates = [];
  const values = [];
  
  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return json({ error: 'Invalid status' }, 400);
    }
    updates.push('status = ?');
    values.push(status);
  }
  if (body.author_name !== undefined) {
    const name = String(body.author_name).trim().substring(0, REVIEW_LIMITS.author_name);
    updates.push('author_name = ?');
    values.push(name);
  }
  if (body.rating !== undefined) {
    const rating = Math.min(REVIEW_LIMITS.rating_max, Math.max(REVIEW_LIMITS.rating_min, parseInt(body.rating) || 5));
    updates.push('rating = ?');
    values.push(rating);
  }
  if (body.comment !== undefined) {
    const comment = String(body.comment).trim().substring(0, REVIEW_LIMITS.comment);
    updates.push('comment = ?');
    values.push(comment);
  }
  if (body.show_on_product !== undefined) {
    updates.push('show_on_product = ?');
    values.push(body.show_on_product ? 1 : 0);
  }

  // Allow admin to override delivery video + thumbnail links.
  // These fields are used by the product page to show portfolio media.
  // If empty string is provided, store NULL so the UI can fall back.
  if (body.delivered_video_url !== undefined) {
    const v = String(body.delivered_video_url || '').trim();
    updates.push('delivered_video_url = ?');
    values.push(v ? v : null);
  }
  if (body.delivered_thumbnail_url !== undefined) {
    const t = String(body.delivered_thumbnail_url || '').trim();
    updates.push('delivered_thumbnail_url = ?');
    values.push(t ? t : null);
  }
  
  if (updates.length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }
  
  values.push(id);
  await env.DB.prepare(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ success: true });
}

/**
 * Delete review
 */
export async function deleteReview(env, id) {
  await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(Number(id)).run();
  return json({ success: true });
}
