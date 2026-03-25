/**
 * Orders controller - Order management
 */

import { json } from '../utils/response.js';
import { toISO8601 } from '../utils/formatting.js';
import { getGoogleScriptUrl } from '../config/secrets.js';
import { calculateAddonPrice, calculateServerSidePrice } from '../utils/pricing.js';
import { calculateDeliveryMinutes, createOrderRecord } from '../utils/order-creation.js';
import { sendOrderNotificationEmails } from '../utils/order-email-notifier.js';

// Webhooks (New Universal System)
import {
  notifyOrderReceived,
  notifyTipReceived,
  notifyCustomerOrderConfirmed,
  notifyCustomerOrderDelivered
} from './webhooks.js';

// Re-export from shared utility for backwards compatibility
export { getLatestOrderForEmail } from '../utils/order-helpers.js';

// Character limits for addon validation
const ADDON_LIMITS = {
  field: 100,      // Field name max length
  value: 2000,     // Value max length
  email: 100,      // Email max length
  totalAddons: 50  // Max number of addons
};

/**
 * Validate and sanitize addons array
 */
function validateAddons(addons) {
  if (!Array.isArray(addons)) return [];

  // Limit number of addons
  const limited = addons.slice(0, ADDON_LIMITS.totalAddons);

  return limited.map(addon => {
    if (!addon || typeof addon !== 'object') return null;

    let field = String(addon.field || '').trim();
    let value = String(addon.value || '').trim();

    // Truncate if too long
    if (field.length > ADDON_LIMITS.field) {
      field = field.substring(0, ADDON_LIMITS.field);
    }
    if (value.length > ADDON_LIMITS.value) {
      value = value.substring(0, ADDON_LIMITS.value);
    }

    return { field, value };
  }).filter(Boolean);
}

/**
 * Validate email
 */
function validateEmail(email) {
  if (!email) return '';
  const trimmed = String(email).trim().substring(0, ADDON_LIMITS.email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : '';
}

/**
 * Get all orders (admin)
 */
export async function getOrders(env) {
  // Join products so we can normalize delivery time for each product
  const r = await env.DB.prepare(`
    SELECT
      o.*,
      p.title as product_title,
      p.instant_delivery as product_instant_delivery,
      p.normal_delivery_text as product_normal_delivery_text
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    ORDER BY o.id DESC
  `).all();

  const orders = (r.results || []).map(row => {
    let email = '', amount = null, addons = [];
    try {
      if (row.encrypted_data && row.encrypted_data[0] === '{') {
        const d = JSON.parse(row.encrypted_data);
        email = d.email || '';
        amount = d.amount;
        addons = d.addons || [];
      }
    } catch (e) {
      console.error('Failed to parse order encrypted_data for order:', row.order_id, e.message);
    }

    // Normalize timestamps to ISO8601 (better JS Date parsing)
    if (row.created_at && typeof row.created_at === 'string') row.created_at = toISO8601(row.created_at);
    if (row.delivered_at && typeof row.delivered_at === 'string') row.delivered_at = toISO8601(row.delivered_at);

    // Normalize delivery time (fix older buggy orders that used a wrong default)
    const productRow = {
      instant_delivery: row.product_instant_delivery,
      normal_delivery_text: row.product_normal_delivery_text
    };
    row.delivery_time_minutes = getEffectiveDeliveryMinutes(row, productRow);

    return { ...row, email, amount, addons };
  });

  return json({ orders });
}

/**
 * Create order (from checkout)
 */
/**
 * Fix/normalize delivery_time_minutes coming from older buggy orders.
 * We only auto-correct common "default" values (60/1440) when the product says otherwise.
 */
function getEffectiveDeliveryMinutes(orderRow, productRow) {
  const stored = Number(orderRow?.delivery_time_minutes);

  const hasProduct =
    !!productRow &&
    (productRow.instant_delivery !== undefined || productRow.normal_delivery_text !== undefined);

  const productMinutes = hasProduct ? calculateDeliveryMinutes(productRow) : null;

  if (!stored || !Number.isFinite(stored) || stored <= 0) {
    return hasProduct ? productMinutes : 60;
  }

  // Auto-correct only when we know the product delivery settings.
  // We only adjust common "default" values (60/1440) when the product says otherwise.
  if (hasProduct && (stored === 60 || stored === 1440) && stored !== productMinutes) {
    return productMinutes;
  }

  return stored;
}



export async function createOrder(env, body) {
  if (!body.productId) return json({ error: 'productId required' }, 400);

  // Validate and sanitize inputs
  const email = validateEmail(body.email);
  const addons = validateAddons(body.addons);

  // SECURITY: Calculate price server-side, ignoring client-provided amount
  // This prevents price manipulation attacks
  let amount = 0;
  let productTitle = '';
  let deliveryMinutes = 0;

  try {
    amount = await calculateServerSidePrice(env, body.productId, addons, body.couponCode);
  } catch (e) {
    console.error('Failed to calculate server-side price:', e);
    return json({ error: 'Failed to calculate order price' }, 400);
  }

  // Get product for title and delivery time calculation
  try {
    const product = await env.DB.prepare(
      'SELECT title, instant_delivery, normal_delivery_text FROM products WHERE id = ?'
    ).bind(Number(body.productId)).first();

    if (product) {
      productTitle = product.title || '';
      // Always use product's delivery settings (each product can be different).
      // This also protects us from buggy clients sending a wrong default like 1440.
      deliveryMinutes = calculateDeliveryMinutes(product);
    }
  } catch (e) {
    console.log('Could not get product details:', e);
  }

  // Ensure we have a valid delivery time
  if (!deliveryMinutes || !Number.isFinite(deliveryMinutes) || deliveryMinutes <= 0) {
    deliveryMinutes = 60; // Default fallback
  }

  const orderId = body.orderId || crypto.randomUUID().split('-')[0].toUpperCase();
  // Store whop_checkout_id if provided (for idempotency check in webhook)
  const data = {
    email: email,
    amount: amount,
    productId: body.productId,
    addons: addons,
    whop_checkout_id: body.checkoutSessionId || null,
    source: 'frontend'
  };

  await createOrderRecord(env, {
    orderId,
    productId: body.productId,
    status: 'PAID',
    deliveryMinutes,
    encryptedData: data
  });

  // Send transactional buyer/admin emails via Brevo (best effort)
  try {
    await sendOrderNotificationEmails(env, {
      orderId,
      customerEmail: email,
      amount,
      currency: 'USD',
      productId: body.productId,
      productTitle,
      addons,
      deliveryTimeMinutes: deliveryMinutes,
      paymentMethod: body.paymentMethod || 'Website Checkout',
      orderSource: 'frontend'
    });
  } catch (e) {
    console.error('Order email notification failed:', e?.message || e);
  }

  // Send notifications (async, don't wait)
  const deliveryTime = deliveryMinutes < 1440 ? `${Math.round(deliveryMinutes / 60)} hour(s)` : `${Math.round(deliveryMinutes / 1440)} day(s)`;

  // Send notifications via Universal Webhooks
  notifyOrderReceived(env, { orderId, email, amount, productTitle }).catch(() => { });
  notifyCustomerOrderConfirmed(env, { orderId, email, amount, productTitle, deliveryTime }).catch(() => { });

  // Send Google Apps Script webhook in the same format used by the universal system.
  // This uses the "order.received" event name and flattens the payload into a "data" object.
  try {
    const googleScriptUrl = await getGoogleScriptUrl(env);
    if (googleScriptUrl) {
      const gsPayload = {
        event: 'order.received',
        data: {
          orderId: orderId,
          productId: body.productId,
          productTitle: productTitle,
          customerName: '', // customer name not available in this context
          customerEmail: email,
          amount: amount,
          currency: 'USD',
          createdAt: new Date().toISOString()
        }
      };
      await fetch(googleScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gsPayload)
      }).catch(err => console.error('Failed to send new order webhook:', err));
    }
  } catch (err) {
    console.error('Error triggering new order webhook:', err);
  }

  return json({ success: true, orderId, amount });
}

/**
 * Create manual order (admin)
 */
export async function createManualOrder(env, body) {
  if (!body.productId || !body.email) {
    return json({ error: 'productId and email required' }, 400);
  }

  // Validate inputs
  const email = validateEmail(body.email);
  if (!email) {
    return json({ error: 'Invalid email format' }, 400);
  }

  const orderId = 'MO' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

  // Validate addons or notes
  let addons = [];
  if (body.addons) {
    addons = validateAddons(body.addons);
  } else if (body.notes) {
    const notes = String(body.notes).trim().substring(0, ADDON_LIMITS.value);
    addons = [{ field: 'Admin Notes', value: notes }];
  }

  const encryptedData = JSON.stringify({
    email: email,
    amount: parseFloat(body.amount) || 0,
    addons: addons,
    manualOrder: true
  });
  const manualDeliveryMinutes = Number(body.deliveryTime) || 60;

      await env.DB.prepare(
    'INSERT INTO orders (order_id, product_id, encrypted_data, status, delivery_time_minutes) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    orderId,
    Number(body.productId),
    encryptedData,
    body.status || 'paid',
    manualDeliveryMinutes
  ).run();
      // Load product title for notifications
      let productTitle = '';
      try {
        const product = await env.DB.prepare('SELECT title FROM products WHERE id = ?').bind(Number(body.productId)).first();
        if (product) {
          productTitle = product.title || '';
        }
      } catch (e) {
        console.warn('Could not load product title for manual order notification');
      }

      // Determine numeric amount (manual orders may not include addons)
      const manualAmount = parseFloat(body.amount) || 0;

      // Send transactional buyer/admin emails via Brevo (best effort)
      try {
        await sendOrderNotificationEmails(env, {
          orderId,
          customerEmail: email,
          amount: manualAmount,
          currency: 'USD',
          productId: body.productId,
          productTitle,
          addons,
          deliveryTimeMinutes: manualDeliveryMinutes,
          paymentMethod: 'Manual Order',
          orderSource: 'admin-manual'
        });
      } catch (e) {
        console.error('Manual order email notification failed:', e?.message || e);
      }

      // Dispatch universal webhook for admin notification
      notifyOrderReceived(env, {
        orderId,
        productId: body.productId,
        productTitle,
        customerName: '',
        customerEmail: email,
        amount: manualAmount,
        currency: 'USD'
      }).catch(() => {});

      // Dispatch universal webhook for customer confirmation
      notifyCustomerOrderConfirmed(env, {
        orderId,
        email,
        amount: manualAmount,
        productTitle
      }).catch(() => {});

      // Send Google Apps Script webhook using universal event format (if configured)
      try {
        const googleScriptUrl = await getGoogleScriptUrl(env);
        if (googleScriptUrl) {
          const gsPayload = {
            event: 'order.received',
            data: {
              orderId: orderId,
              productId: body.productId,
              productTitle: productTitle,
              customerName: '',
              customerEmail: email,
              amount: manualAmount,
              currency: 'USD',
              createdAt: new Date().toISOString()
            }
          };
          await fetch(googleScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gsPayload)
          }).catch(err => console.error('Failed to send manual order webhook:', err));
        }
      } catch (err) {
        console.error('Error triggering manual order webhook:', err);
      }

      return json({ success: true, orderId });
}

/**
 * Get buyer order view
 */
export async function getBuyerOrder(env, orderId) {
  const row = await env.DB.prepare(
    'SELECT o.*, p.title as product_title, p.thumbnail_url as product_thumbnail, p.whop_product_id, p.instant_delivery as product_instant_delivery, p.normal_delivery_text as product_normal_delivery_text FROM orders o LEFT JOIN products p ON o.product_id = p.id WHERE o.order_id = ?'
  ).bind(orderId).first();

  if (!row) return json({ error: 'Order not found' }, 404);

  // Check if review already exists for this order
  const reviewCheck = await env.DB.prepare(
    'SELECT id FROM reviews WHERE order_id = ? LIMIT 1'
  ).bind(orderId).first();
  const hasReview = !!reviewCheck;

  let addons = [], email = '', amount = null;
  try {
    if (row.encrypted_data && row.encrypted_data[0] === '{') {
      const d = JSON.parse(row.encrypted_data);
      addons = d.addons || [];
      email = d.email || '';
      amount = d.amount;
    }
  } catch (e) {
    console.error('Failed to parse order encrypted_data for buyer order:', orderId, e.message);
  }

  // Hide internal stream URLs (e.g., YouTube) from buyer payload.
  let buyerSafeVideoMetadata = row.delivered_video_metadata || null;
  if (buyerSafeVideoMetadata) {
    const meta = parseMetadataObject(buyerSafeVideoMetadata);
    if (meta.youtubeUrl) delete meta.youtubeUrl;
    if (meta.reviewYoutubeUrl) delete meta.reviewYoutubeUrl;
    buyerSafeVideoMetadata = Object.keys(meta).length ? JSON.stringify(meta) : null;
  }

  // Convert SQLite datetime to ISO 8601 format
  const orderData = {
    ...row,
    delivered_video_metadata: buyerSafeVideoMetadata,
    addons,
    email,
    amount,
    has_review: hasReview,
    tip_paid: !!row.tip_paid,
    tip_amount: row.tip_amount || 0
  };
  if (orderData.created_at && typeof orderData.created_at === 'string') {
    orderData.created_at = toISO8601(orderData.created_at);
  }

  if (orderData.delivered_at && typeof orderData.delivered_at === 'string') {
    orderData.delivered_at = toISO8601(orderData.delivered_at);
  }

  // Normalize delivery time (fix older buggy orders that used a wrong default)
  const productRow = {
    instant_delivery: orderData.product_instant_delivery,
    normal_delivery_text: orderData.product_normal_delivery_text
  };
  orderData.delivery_time_minutes = getEffectiveDeliveryMinutes(orderData, productRow);

  return json({ order: orderData });
}

/**
 * Delete order
 */
export async function deleteOrder(env, id) {
  if (!id) return json({ error: 'Missing id' }, 400);

  // Support deleting by numeric row id OR by public order_id
  const asNumber = Number(id);
  if (!Number.isNaN(asNumber) && String(id).trim() === String(asNumber)) {
    await env.DB.prepare('DELETE FROM reviews WHERE order_id IN (SELECT order_id FROM orders WHERE id = ?)').bind(asNumber).run();
    await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(asNumber).run();
    return json({ success: true });
  }

  const orderId = String(id).trim();
  await env.DB.prepare('DELETE FROM reviews WHERE order_id = ?').bind(orderId).run();
  await env.DB.prepare('DELETE FROM orders WHERE order_id = ?').bind(orderId).run();
  return json({ success: true });
}

/**
 * Delete all orders (admin cleanup)
 */
export async function deleteAllOrders(env) {
  try {
    // Remove reviews linked to existing orders first to avoid orphaned review rows
    const reviewsResult = await env.DB.prepare(
      'DELETE FROM reviews WHERE order_id IN (SELECT order_id FROM orders)'
    ).run();
    const ordersResult = await env.DB.prepare('DELETE FROM orders').run();

    return json({
      success: true,
      count: ordersResult?.changes || 0,
      deleted_order_reviews: reviewsResult?.changes || 0
    });
  } catch (err) {
    return json({ error: err.message || 'Failed to delete all orders' }, 500);
  }
}

/**
 * Update order
 */
export async function updateOrder(env, body) {
  const orderId = body.orderId;

  if (!orderId) return json({ error: 'orderId required' }, 400);

  const updates = [];
  const values = [];

  if (body.status !== undefined) {
    updates.push('status = ?');
    values.push(body.status);
  }
  if (body.delivery_time_minutes !== undefined) {
    updates.push('delivery_time_minutes = ?');
    values.push(Number(body.delivery_time_minutes));
  }

  if (updates.length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  values.push(orderId);
  await env.DB.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`).bind(...values).run();
  return json({ success: true });
}

function parseMetadataObject(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Deliver order
 */
export async function deliverOrder(env, body) {
  const orderId = String(body?.orderId || '').trim();
  const videoUrl = String(body?.videoUrl || '').trim();
  const downloadUrl = String(body?.downloadUrl || videoUrl || body?.archiveUrl || '').trim();
  const youtubeUrl = String(body?.youtubeUrl || '').trim();

  if (!orderId) return json({ error: 'orderId required' }, 400);
  if (!downloadUrl && !youtubeUrl) {
    return json({ error: 'downloadUrl or youtubeUrl required' }, 400);
  }

  const deliveredVideoUrl = downloadUrl || youtubeUrl;

  // Get order data before updating
  const orderResult = await env.DB.prepare(
    'SELECT orders.*, products.title as product_title FROM orders LEFT JOIN products ON orders.product_id = products.id WHERE orders.order_id = ?'
  ).bind(orderId).first();

  // Prepare additional metadata for delivered videos
  const deliveredVideoMetadata = JSON.stringify({
    embedUrl: body.embedUrl,
    itemId: body.itemId,
    subtitlesUrl: body.subtitlesUrl,
    tracks: Array.isArray(body.tracks) ? body.tracks : undefined,
    downloadUrl: downloadUrl || undefined,
    youtubeUrl: youtubeUrl || undefined,
    deliveredAt: new Date().toISOString()
  });

  await env.DB.prepare(
    'UPDATE orders SET delivered_video_url=?, delivered_thumbnail_url=?, archive_url=COALESCE(?, archive_url), status=?, delivered_at=CURRENT_TIMESTAMP, delivered_video_metadata=? WHERE order_id=?'
  ).bind(deliveredVideoUrl, body.thumbnailUrl || null, downloadUrl || null, 'delivered', deliveredVideoMetadata, orderId).run();

  // Get customer email for notification
  let customerEmail = '';
  try {
    if (orderResult?.encrypted_data) {
      const decrypted = JSON.parse(orderResult.encrypted_data);
      customerEmail = decrypted.email || '';
    }
  } catch (e) { }

  // Send customer delivery notification (async)
  notifyCustomerOrderDelivered(env, {
    orderId: orderId,
    email: customerEmail,
    productTitle: orderResult?.product_title || 'Your Order'
  }).catch(() => { });

  // Trigger email webhook if configured (legacy support)
  try {
    const googleScriptUrl = await getGoogleScriptUrl(env);
    if (googleScriptUrl && orderResult) {
      // Use the universal "order.delivered" event name and flatten payload into a "data" object
      const gsPayload = {
        event: 'order.delivered',
        data: {
          orderId: orderId,
          productTitle: orderResult.product_title || 'Your Order',
          customerEmail: customerEmail,
          // Provide both deliveryUrl and videoUrl for compatibility
          deliveryUrl: downloadUrl || deliveredVideoUrl,
          videoUrl: deliveredVideoUrl,
          youtubeUrl: youtubeUrl || undefined
        }
      };
      await fetch(googleScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gsPayload)
      }).catch(err => console.error('Failed to send delivery webhook:', err));
    }
  } catch (err) {
    console.error('Error triggering delivery webhook:', err);
  }

  return json({ success: true, deliveredVideoUrl, downloadUrl: downloadUrl || null, youtubeUrl: youtubeUrl || null });
}

/**
 * Request revision
 */
export async function requestRevision(env, body) {
  if (!body.orderId) return json({ error: 'orderId required' }, 400);

  // Get order data before updating
  const orderResult = await env.DB.prepare(
    'SELECT orders.*, products.title as product_title FROM orders LEFT JOIN products ON orders.product_id = products.id WHERE orders.order_id = ?'
  ).bind(body.orderId).first();

  await env.DB.prepare(
    'UPDATE orders SET revision_requested=1, revision_count=revision_count+1, revision_reason=?, status=? WHERE order_id=?'
  ).bind(body.reason || 'No reason provided', 'revision', body.orderId).run();

  // Trigger revision notification webhook if configured
  try {
    const googleScriptUrl = await getGoogleScriptUrl(env);
    if (googleScriptUrl && orderResult) {
      let customerEmail = '';
      try {
        const decrypted = JSON.parse(orderResult.encrypted_data);
        customerEmail = decrypted.email || '';
      } catch (e) {
        console.warn('Could not decrypt order data for email');
      }

      // Use a universal event and flatten payload into a "data" object
      const gsPayload = {
        event: 'order.revision_requested',
        data: {
          orderId: body.orderId,
          productTitle: orderResult.product_title || 'Your Order',
          customerEmail: customerEmail,
          revisionReason: body.reason || 'No reason provided',
          revisionCount: (orderResult.revision_count || 0) + 1,
          status: 'revision'
        }
      };
      await fetch(googleScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gsPayload)
      }).catch(err => console.error('Failed to send revision webhook:', err));
    }
  } catch (err) {
    console.error('Error triggering revision webhook:', err);
  }

  return json({ success: true });
}

/**
 * Update portfolio flag
 */
export async function updatePortfolio(env, body) {
  await env.DB.prepare(
    'UPDATE orders SET portfolio_enabled=? WHERE order_id=?'
  ).bind(body.portfolioEnabled ? 1 : 0, body.orderId).run();
  return json({ success: true });
}

/**
 * Update archive link
 */
export async function updateArchiveLink(env, body) {
  const orderId = String(body?.orderId || '').trim();
  const archiveUrl = String(body?.archiveUrl || '').trim();
  const youtubeUrl = String(body?.youtubeUrl || '').trim();

  if (!orderId || !archiveUrl) {
    return json({ error: 'orderId and archiveUrl required' }, 400);
  }

  const existing = await env.DB.prepare(
    'SELECT delivered_video_metadata FROM orders WHERE order_id = ?'
  ).bind(orderId).first();

  const existingMeta = parseMetadataObject(existing?.delivered_video_metadata || '');
  const nextMeta = {
    ...existingMeta,
    downloadUrl: archiveUrl,
    youtubeUrl: youtubeUrl || existingMeta.youtubeUrl,
    deliveredAt: new Date().toISOString()
  };

  await env.DB.prepare(
    'UPDATE orders SET archive_url=?, delivered_video_url=?, status=?, delivered_at=CURRENT_TIMESTAMP, delivered_video_metadata=? WHERE order_id=?'
  ).bind(archiveUrl, archiveUrl, 'delivered', JSON.stringify(nextMeta), orderId).run();

  return json({ success: true });
}

/**
 * Mark tip as paid
 */
export async function markTipPaid(env, body) {
  const { orderId, amount } = body;
  if (!orderId) return json({ error: 'orderId required' }, 400);

  await env.DB.prepare(
    'UPDATE orders SET tip_paid = 1, tip_amount = ? WHERE order_id = ?'
  ).bind(Number(amount) || 0, orderId).run();

  // Get customer email for notification
  let email = '';
  try {
    const order = await env.DB.prepare('SELECT encrypted_data FROM orders WHERE order_id = ?').bind(orderId).first();
    if (order?.encrypted_data) {
      const data = JSON.parse(order.encrypted_data);
      email = data.email || '';
    }
  } catch (e) { }

  // Notify admin about tip (async)
  notifyTipReceived(env, { orderId, amount: Number(amount) || 0, email }).catch(() => { });

  return json({ success: true });
}
