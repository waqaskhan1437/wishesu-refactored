/**
 * Order helpers - Shared utilities for order lookups
 */

/**
 * Get latest order for an email address
 * Used by both chat system and orders controller
 * @param {Object} env - Environment with DB binding
 * @param {string} email - Email address to search
 * @returns {Object|null} Order info or null if not found
 */
export async function getLatestOrderForEmail(env, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  const candidates = await env.DB.prepare(
    `SELECT order_id, status, archive_url, encrypted_data, created_at
     FROM orders
     ORDER BY datetime(created_at) DESC
     LIMIT 80`
  ).all();

  const list = candidates?.results || [];

  for (const o of list) {
    try {
      if (!o.encrypted_data) continue;
      const data = JSON.parse(o.encrypted_data);
      const e = String(data.email || '').trim().toLowerCase();
      if (e && e === target) {
        return {
          order_id: o.order_id,
          status: o.status,
          trackLink: `/buyer-order.html?id=${encodeURIComponent(o.order_id)}`
        };
      }
    } catch {
      // Skip malformed entries
    }
  }
  return null;
}
