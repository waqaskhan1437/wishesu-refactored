/**
 * Standard response helpers for JSON and error responses
 */

import { CORS } from '../config/cors.js';

/**
 * Create a JSON response with CORS headers
 * @param {Object} data - Data to serialize
 * @param {number} status - HTTP status code
 * @param {Object} extraHeaders - Additional headers (e.g., Cache-Control)
 * @returns {Response}
 */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extraHeaders }
  });
}

/**
 * Create a cached JSON response (for public, read-only endpoints)
 * @param {Object} data - Data to serialize
 * @param {number} maxAge - Cache duration in seconds (default 60)
 * @returns {Response}
 */
export function cachedJson(data, maxAge = 60) {
  return json(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge * 2}, stale-while-revalidate=${maxAge * 4}`
  });
}

/**
 * Create an error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function errorResponse(message, status = 500) {
  return json({ error: message }, status);
}

/**
 * Create a success response
 * @param {Object} data - Additional data to include
 * @returns {Response}
 */
export function successResponse(data = {}) {
  return json({ success: true, ...data });
}
