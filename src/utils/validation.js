/**
 * Input validation utilities
 */

/**
 * Enforce rate limit for chat messages (1 message per second)
 * @param {Object} env - Environment bindings
 * @param {string} sessionId
 * @throws {Error} If rate limited
 */
export async function enforceUserRateLimit(env, sessionId) {
  const row = await env.DB.prepare(
    `SELECT strftime('%s', created_at) AS ts
     FROM chat_messages
     WHERE session_id = ? AND role = 'user'
     ORDER BY id DESC
     LIMIT 1`
  ).bind(sessionId).first();

  if (!row?.ts) return;

  const lastTs = Number(row.ts) || 0;
  const nowTs = Math.floor(Date.now() / 1000);

  if (nowTs - lastTs < 1) {
    const err = new Error('Rate limited');
    err.status = 429;
    throw err;
  }
}

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate required fields
 * @param {Object} data
 * @param {Array<string>} fields
 * @returns {{valid: boolean, missing: Array<string>}}
 */
export function validateRequired(data, fields) {
  const missing = fields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  return { valid: missing.length === 0, missing };
}

/**
 * Check if value is a valid number
 * @param {*} value
 * @returns {boolean}
 */
export function isValidNumber(value) {
  if (value === undefined || value === null || value === '') return false;
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

/**
 * Validate Whop plan ID format
 * @param {string} planId
 * @returns {boolean}
 */
export function isValidWhopPlanId(planId) {
  if (!planId || typeof planId !== 'string') return false;
  return planId.startsWith('plan_') && planId.length > 5;
}
