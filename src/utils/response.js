/**
 * Standard response helpers for JSON and error responses
 * Consolidated from 75+ new Response() patterns across codebase
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

/**
 * Create an HTML response
 * @param {string} html - HTML content
 * @param {number} status - HTTP status code
 * @param {Object} extraHeaders - Additional headers
 * @returns {Response}
 */
export function html(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders
    }
  });
}

/**
 * Create a text response
 * @param {string} text - Text content
 * @param {number} status - HTTP status code
 * @param {Object} extraHeaders - Additional headers
 * @returns {Response}
 */
export function text(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders
    }
  });
}

/**
 * Create a not found response
 * @param {string} message - Optional message
 * @returns {Response}
 */
export function notFoundResponse(message = 'Not found') {
  return json({ error: message }, 404);
}

/**
 * Create an unauthorized response
 * @param {string} message - Optional message
 * @returns {Response}
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return json({ error: message }, 401);
}

/**
 * Create a forbidden response
 * @param {string} message - Optional message
 * @returns {Response}
 */
export function forbiddenResponse(message = 'Forbidden') {
  return json({ error: message }, 403);
}

/**
 * Create a bad request response
 * @param {string} message - Optional message
 * @returns {Response}
 */
export function badRequestResponse(message = 'Bad request') {
  return json({ error: message }, 400);
}

/**
 * Create a redirect response
 * @param {string} url - Redirect URL
 * @param {number} status - Redirect status (301, 302, 307, 308)
 * @returns {Response}
 */
export function redirectResponse(url, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url }
  });
}

/**
 * Create a file/stream response
 * @param {ReadableStream} body - Response body stream
 * @param {string} contentType - Content type
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function fileResponse(body, contentType = 'application/octet-stream', status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType }
  });
}

/**
 * Create an empty response
 * @param {number} status - HTTP status code
 * @param {Object} headers - Response headers
 * @returns {Response}
 */
export function emptyResponse(status = 204, headers = {}) {
  return new Response(null, { status, headers });
}
