/**
 * Cache Headers Constants & Helpers
 * Consolidated from all duplicates across the codebase
 */

export const CACHE_NO_STORE = 'no-store, no-cache, must-revalidate';
export const CACHE_PRIVATE = 'private, no-cache, no-store, must-revalidate';

export const CACHE_SHORT = 'public, max-age=60';
export const CACHE_MEDIUM = 'public, max-age=120';
export const CACHE_STANDARD = 'public, max-age=300';
export const CACHE_LONG = 'public, max-age=3600';
export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';

export const CACHE_API_SHORT = 'public, max-age=15, s-maxage=30';
export const CACHE_API_MEDIUM = 'public, max-age=30, s-maxage=60';
export const CACHE_API_LONG = 'public, max-age=60, s-maxage=300';

export function noStoreHeaders(extra = {}) {
  return {
    'Cache-Control': CACHE_NO_STORE,
    'Pragma': 'no-cache',
    ...extra
  };
}

export function cacheHeaders(maxAge = 300, isSensitive = false) {
  if (isSensitive) {
    return {
      'Cache-Control': CACHE_NO_STORE,
      'Pragma': 'no-cache'
    };
  }
  return {
    'Cache-Control': `public, max-age=${maxAge}`
  };
}

export function apiCacheHeaders(maxAge = 30, sMaxAge = 60) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${sMaxAge}`
  };
}
