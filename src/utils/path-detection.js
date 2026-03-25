/**
 * Path Detection & Security Utilities
 * Scanner detection, path validation, and security helpers
 */

// Scanner detection patterns
export const SCANNER_PREFIXES = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/phpmyadmin',
  '/pma',
  '/adminer',
  '/mysql',
  '/xmlrpc.php',
  '/cgi-bin',
  '/vendor/',
  '/boaform',
  '/hnap1',
  '/.git',
  '/.env'
];

export const SCANNER_PATH_RE = /\.(php[0-9]?|phtml|asp|aspx|jsp|cgi|env|ini|sql|bak|old|log|swp)$/i;
export const DYNAMIC_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

// Top-level `/api/{segment}` allowlist
export const KNOWN_API_SEGMENTS = new Set([
  'admin',
  'backup',
  'blog',
  'blogs',
  'chat',
  'coupons',
  'debug',
  'forum',
  'health',
  'lead',
  'order',
  'orders',
  'page',
  'pages',
  'payment',
  'paypal',
  'product',
  'products',
  'purge-cache',
  'r2',
  'reviews',
  'settings',
  'time',
  'upload',
  'whop'
]);

export function isLikelyScannerPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (!p || p === '/') return false;

  if (SCANNER_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (p.includes('/.git/') || p.includes('/.env')) return true;
  if (SCANNER_PATH_RE.test(p) && !p.endsWith('.html')) return true;

  return false;
}

export function canLookupDynamicSlug(slug) {
  const s = String(slug || '').toLowerCase();
  return DYNAMIC_SLUG_RE.test(s);
}

export function isKnownApiPath(pathname) {
  const p = String(pathname || '');
  if (!p.startsWith('/api/')) return true;
  const apiTail = p.slice('/api/'.length);
  const firstSegment = apiTail.split('/')[0].toLowerCase();
  return !!firstSegment && KNOWN_API_SEGMENTS.has(firstSegment);
}

export function isMalformedNestedSlug(pathname, prefix) {
  const p = String(pathname || '');
  if (!p.startsWith(prefix) || p === prefix || p.includes('.')) return false;
  let slug = p.slice(prefix.length);
  if (slug.endsWith('/')) slug = slug.slice(0, -1);
  if (!slug) return false;
  if (slug.includes('/')) return true;
  return !canLookupDynamicSlug(slug);
}
