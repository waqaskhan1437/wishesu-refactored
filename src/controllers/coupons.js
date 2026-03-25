/**
 * Coupons Controller
 * Handles coupon CRUD and validation
 */

import { json, cachedJson } from '../utils/response.js';

// In-memory cache for active coupons
let couponsCache = null;
let couponsCacheTime = 0;
const COUPONS_CACHE_TTL = 60000; // 1 minute

/**
 * Get all coupons (admin)
 */
export async function getCoupons(env) {
  try {
    // Ensure table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount_type TEXT DEFAULT 'percentage',
        discount_value REAL NOT NULL,
        min_order_amount REAL DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        valid_from INTEGER,
        valid_until INTEGER,
        product_ids TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER
      )
    `).run();
    
    const result = await env.DB.prepare(`
      SELECT * FROM coupons ORDER BY created_at DESC
    `).all();
    
    return json({ success: true, coupons: result.results || [] });
  } catch (e) {
    console.error('Get coupons error:', e);
    return json({ success: true, coupons: [] });
  }
}

/**
 * Get active coupons (for product page)
 * OPTIMIZED: With in-memory caching
 */
export async function getActiveCoupons(env) {
  const now = Date.now();
  
  // Return cached if valid
  if (couponsCache && (now - couponsCacheTime) < COUPONS_CACHE_TTL) {
    return cachedJson({ success: true, coupons: couponsCache }, 60);
  }
  
  try {
    const result = await env.DB.prepare(`
      SELECT id, code, discount_type, discount_value, min_order_amount, product_ids
      FROM coupons 
      WHERE status = 'active'
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_until IS NULL OR valid_until >= ?)
        AND (max_uses = 0 OR used_count < max_uses)
    `).bind(now, now).all();
    
    couponsCache = result.results || [];
    couponsCacheTime = now;
    
    return cachedJson({ success: true, coupons: couponsCache }, 60);
  } catch (e) {
    console.error('Get active coupons error:', e);
    return json({ success: true, coupons: [] });
  }
}

/**
 * Check if coupons feature is enabled
 */
export async function getCouponsEnabled(env) {
  try {
    // First ensure coupons table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount_type TEXT DEFAULT 'percentage',
        discount_value REAL NOT NULL,
        min_order_amount REAL DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        valid_from INTEGER,
        valid_until INTEGER,
        product_ids TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER
      )
    `).run();
    
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('coupons_enabled').first();
    const enabled = row?.value === 'true';
    return cachedJson({ success: true, enabled }, 120);
  } catch (e) {
    console.error('getCouponsEnabled error:', e);
    return json({ success: true, enabled: false });
  }
}

/**
 * Toggle coupons feature
 */
export async function setCouponsEnabled(env, body) {
  try {
    const enabled = body.enabled ? 'true' : 'false';
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('coupons_enabled', enabled).run();
    return json({ success: true, enabled: body.enabled });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * Validate and apply a coupon code
 */
export async function validateCoupon(env, body) {
  const { code, product_id, order_amount } = body;
  
  if (!code) {
    return json({ valid: false, error: 'Coupon code is required' });
  }
  
  try {
    const now = Date.now();
    const coupon = await env.DB.prepare(`
      SELECT * FROM coupons 
      WHERE code = ? COLLATE NOCASE
        AND status = 'active'
    `).bind(code.trim()).first();
    
    if (!coupon) {
      return json({ valid: false, error: 'Invalid coupon code' });
    }
    
    // Check validity period
    if (coupon.valid_from && coupon.valid_from > now) {
      return json({ valid: false, error: 'This coupon is not yet active' });
    }
    
    if (coupon.valid_until && coupon.valid_until < now) {
      return json({ valid: false, error: 'This coupon has expired' });
    }
    
    // Check usage limit
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return json({ valid: false, error: 'This coupon has reached its usage limit' });
    }
    
    // Check minimum order amount
    if (coupon.min_order_amount > 0 && order_amount < coupon.min_order_amount) {
      return json({ 
        valid: false, 
        error: `Minimum order amount is $${coupon.min_order_amount.toFixed(2)}` 
      });
    }
    
    // Check product restriction
    if (coupon.product_ids && product_id) {
      const allowedProducts = coupon.product_ids.split(',').map(p => p.trim());
      if (!allowedProducts.includes(String(product_id)) && !allowedProducts.includes('all')) {
        return json({ valid: false, error: 'This coupon is not valid for this product' });
      }
    }
    
    // Calculate discount
    let discount = 0;
    let discountedPrice = order_amount;
    
    if (coupon.discount_type === 'percentage') {
      discount = (order_amount * coupon.discount_value) / 100;
      discountedPrice = order_amount - discount;
    } else if (coupon.discount_type === 'fixed') {
      discount = Math.min(coupon.discount_value, order_amount);
      discountedPrice = order_amount - discount;
    }
    
    // Ensure price doesn't go below 0
    discountedPrice = Math.max(0, discountedPrice);
    
    return json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value
      },
      discount: Math.round(discount * 100) / 100,
      discounted_price: Math.round(discountedPrice * 100) / 100,
      original_price: order_amount
    });
  } catch (e) {
    console.error('Validate coupon error:', e);
    return json({ valid: false, error: 'Failed to validate coupon' });
  }
}

/**
 * Increment coupon usage (call after successful order)
 */
export async function useCoupon(env, couponId) {
  try {
    await env.DB.prepare(`
      UPDATE coupons SET used_count = used_count + 1 WHERE id = ?
    `).bind(couponId).run();
    
    // Invalidate cache
    couponsCache = null;
    
    return { success: true };
  } catch (e) {
    console.error('Use coupon error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Create a new coupon
 */
export async function createCoupon(env, body) {
  try {
    const {
      code,
      discount_type = 'percentage',
      discount_value,
      min_order_amount = 0,
      max_uses = 0,
      valid_from,
      valid_until,
      product_ids,
      status = 'active'
    } = body;
    
    if (!code || !discount_value) {
      return json({ error: 'Code and discount value are required' }, 400);
    }
    
    // Check for duplicate code
    const existing = await env.DB.prepare('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE').bind(code.trim()).first();
    if (existing) {
      return json({ error: 'A coupon with this code already exists' }, 400);
    }
    
    const result = await env.DB.prepare(`
      INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, valid_from, valid_until, product_ids, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      code.trim().toUpperCase(),
      discount_type,
      discount_value,
      min_order_amount,
      max_uses,
      valid_from || null,
      valid_until || null,
      product_ids || null,
      status,
      Date.now()
    ).run();
    
    // Invalidate cache
    couponsCache = null;
    
    return json({ success: true, id: result.meta?.last_row_id });
  } catch (e) {
    console.error('Create coupon error:', e);
    return json({ error: e.message }, 500);
  }
}

/**
 * Update a coupon
 */
export async function updateCoupon(env, body) {
  try {
    const {
      id,
      code,
      discount_type,
      discount_value,
      min_order_amount,
      max_uses,
      valid_from,
      valid_until,
      product_ids,
      status
    } = body;
    
    if (!id) {
      return json({ error: 'Coupon ID is required' }, 400);
    }
    
    await env.DB.prepare(`
      UPDATE coupons SET
        code = ?,
        discount_type = ?,
        discount_value = ?,
        min_order_amount = ?,
        max_uses = ?,
        valid_from = ?,
        valid_until = ?,
        product_ids = ?,
        status = ?
      WHERE id = ?
    `).bind(
      code.trim().toUpperCase(),
      discount_type,
      discount_value,
      min_order_amount || 0,
      max_uses || 0,
      valid_from || null,
      valid_until || null,
      product_ids || null,
      status,
      id
    ).run();
    
    // Invalidate cache
    couponsCache = null;
    
    return json({ success: true });
  } catch (e) {
    console.error('Update coupon error:', e);
    return json({ error: e.message }, 500);
  }
}

/**
 * Delete a coupon
 */
export async function deleteCoupon(env, id) {
  try {
    await env.DB.prepare('DELETE FROM coupons WHERE id = ?').bind(id).run();
    
    // Invalidate cache
    couponsCache = null;
    
    return json({ success: true });
  } catch (e) {
    console.error('Delete coupon error:', e);
    return json({ error: e.message }, 500);
  }
}

/**
 * Toggle coupon status
 */
export async function toggleCouponStatus(env, body) {
  try {
    const { id, status } = body;
    await env.DB.prepare('UPDATE coupons SET status = ? WHERE id = ?').bind(status, id).run();
    
    // Invalidate cache
    couponsCache = null;
    
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
