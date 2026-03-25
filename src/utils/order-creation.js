/**
 * Order creation utilities - Shared functions for creating orders
 * Consolidated from orders.js, whop.js, and paypal.js
 */

/**
 * Compute delivery time in minutes from product settings.
 * - instant_delivery => 60 minutes
 * - normal_delivery_text/delivery_time_days => days used to calculate minutes
 * 
 * @param {Object} product - Product object from DB
 * @param {number|string} defaultMinutes - Optional default/fallback minutes (default: 60)
 * @returns {number} Delivery time in minutes
 */
export function calculateDeliveryMinutes(product, defaultMinutes = 60) {
    if (!product) return Number(defaultMinutes) || 60;

    // Check for instant delivery
    const isInstant =
        product.instant_delivery === 1 ||
        product.instant_delivery === true ||
        product.instant_delivery === '1';

    if (isInstant) return 60;

    // Check for days setting (supports both column names used in DB/logic)
    let days = 0;
    if (product.normal_delivery_text !== undefined) {
        days = parseInt(product.normal_delivery_text, 10);
    } else if (product.delivery_time_days !== undefined) {
        days = parseInt(product.delivery_time_days, 10);
    }

    // If valid days found, convert to minutes
    if (Number.isFinite(days) && days > 0) {
        return days * 24 * 60;
    }

    return Number(defaultMinutes) || 60;
}

/**
 * Creae a new order record in the database
 * Handles the standard pattern of encrypting order details and inserting a row
 * 
 * @param {Object} env - Environment with DB binding
 * @param {Object} params - Order parameters
 * @param {string} params.orderId - Unique order ID
 * @param {number} params.productId - Product ID
 * @param {string} params.status - Order status (e.g., 'PAID', 'completed')
 * @param {number} params.deliveryMinutes - Calculated delivery minutes
 * @param {Object} params.encryptedData - Data to encrypt/stringify into encrypted_data column
 * @returns {Promise<void>}
 */
export async function createOrderRecord(env, params) {
    const { orderId, productId, status, deliveryMinutes, encryptedData } = params;

    const dataString = typeof encryptedData === 'string'
        ? encryptedData
        : JSON.stringify(encryptedData);

    // Insert with manual created_at timestamp to ensure consistency across DB drivers
    // Using SQLite's datetime('now')
    await env.DB.prepare(
        `INSERT INTO orders 
    (order_id, product_id, encrypted_data, status, delivery_time_minutes, created_at) 
    VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
        orderId,
        Number(productId),
        dataString,
        status,
        Number(deliveryMinutes)
    ).run();

    console.log(`📦 Order created: ${orderId}, Product: ${productId}, Delivery: ${deliveryMinutes} mins`);
}
