/**
 * Cache Utilities
 * Consolidated cache key generation and cache helpers
 * Consolidated from index.js
 */

const DEFAULT_VERSION = '1';

export function buildVersionedCacheKey(req, accept = 'text/html') {
  const url = req.url || '';
  const u = new URL(url);
  const version = String(req?.env?.VERSION || DEFAULT_VERSION).trim() || DEFAULT_VERSION;
  
  const acceptLower = String(accept || '').toLowerCase();
  
  if (acceptLower.includes('text/html')) {
    return new Request(`${u.origin}${u.pathname}?__v=${version}`, {
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    });
  }
  
  if (acceptLower.includes('application/json')) {
    return new Request(`${u.origin}${u.pathname}?__v=${version}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
  }
  
  return new Request(`${u.origin}${u.pathname}?__v=${version}`, {
    method: 'GET',
    headers: { 'Accept': accept || '*/*' }
  });
}

export function buildCacheKey(pathname, version = DEFAULT_VERSION) {
  return `${pathname}?__v=${version}`;
}

export function parseCacheVersion(url) {
  const u = new URL(url);
  return u.searchParams.get('__v') || DEFAULT_VERSION;
}

export function shouldServeFromCache(req, maxAge = 300) {
  const url = req?.url ? new URL(req.url) : null;
  if (!url) return false;
  
  const cacheControl = req.headers?.get('Cache-Control') || '';
  
  if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
    return false;
  }
  
  if (cacheControl.includes('max-age=0')) {
    return false;
  }
  
  return true;
}

export async function getFromCache(cacheName, key) {
  try {
    if (!caches?.default) return null;
    const cache = await caches.open(cacheName);
    const response = await cache.match(key);
    return response || null;
  } catch (e) {
    console.warn('Cache get error:', e.message);
    return null;
  }
}

export async function setToCache(cacheName, key, response, maxAge = 300) {
  try {
    if (!caches?.default) return false;
    
    const cache = await caches.open(cacheName);
    
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${maxAge}`);
    headers.set('X-Cache', 'MISS');
    
    const body = await response.clone().arrayBuffer();
    const cachedResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    
    await cache.put(key, cachedResponse);
    return true;
  } catch (e) {
    console.warn('Cache set error:', e.message);
    return false;
  }
}

export async function deleteFromCache(cacheName, key) {
  try {
    if (!caches?.default) return false;
    const cache = await caches.open(cacheName);
    await cache.delete(key);
    return true;
  } catch (e) {
    console.warn('Cache delete error:', e.message);
    return false;
  }
}

export async function clearCache(cacheName) {
  try {
    if (!caches?.default) return false;
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
    return true;
  } catch (e) {
    console.warn('Cache clear error:', e.message);
    return false;
  }
}

export function getCacheControlForFile(extension) {
  const ext = String(extension || '').toLowerCase();
  
  const immutableExts = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  if (immutableExts.includes(ext)) {
    return 'public, max-age=31536000, immutable';
  }
  
  const htmlExts = ['.html', '.htm'];
  if (htmlExts.includes(ext)) {
    return 'public, max-age=300';
  }
  
  return 'public, max-age=3600';
}
