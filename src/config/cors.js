/**
 * CORS and cache configuration for all API responses
 */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache'
};

/**
 * Handle CORS preflight OPTIONS request
 * @returns {Response}
 */
export function handleOptions() {
  return new Response(null, { headers: CORS });
}
