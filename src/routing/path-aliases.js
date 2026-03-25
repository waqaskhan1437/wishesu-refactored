/**
 * Path Aliases & Canonical URL Utilities
 * Consolidated path normalization and aliases
 */

export const CANONICAL_ALIAS_MAP = new Map([
  ['/index.html', '/'],
  ['/home', '/'],
  ['/home/', '/'],
  ['/page-builder', '/admin/page-builder.html'],
  ['/page-builder/', '/admin/page-builder.html'],
  ['/page-builder.html', '/admin/page-builder.html'],
  ['/landing-builder', '/admin/landing-builder.html'],
  ['/landing-builder/', '/admin/landing-builder.html'],
  ['/landing-builder.html', '/admin/landing-builder.html'],
  ['/blog/index.html', '/blog'],
  ['/blog.html', '/blog'],
  ['/forum/index.html', '/forum'],
  ['/forum.html', '/forum'],
  ['/terms/', '/terms'],
  ['/terms/index.html', '/terms'],
  ['/terms.html', '/terms'],
  ['/products/index.html', '/products'],
  ['/products.html', '/products'],
  ['/products-grid', '/products'],
  ['/products-grid/', '/products'],
  ['/products-grid.html', '/products'],
  ['/checkout/', '/checkout'],
  ['/checkout/index.html', '/checkout'],
  ['/success.html', '/success'],
  ['/buyer-order/', '/buyer-order'],
  ['/buyer-order.html', '/buyer-order'],
  ['/order-detail/', '/order-detail'],
  ['/order-detail.html', '/order-detail'],
  ['/order-success', '/success'],
  ['/order-success.html', '/success']
]);

export const DIRECT_INTERNAL_ALIAS_PATHS = new Set([
  '/index.html',
  '/home',
  '/home/',
  '/blog/index.html',
  '/blog.html',
  '/forum/index.html',
  '/forum.html',
  '/terms',
  '/terms/',
  '/terms/index.html',
  '/terms.html',
  '/products.html',
  '/products-grid',
  '/products-grid/',
  '/products-grid.html',
  '/products/index.html',
  '/checkout/',
  '/checkout/index.html',
  '/success/',
  '/success.html',
  '/buyer-order/',
  '/buyer-order.html',
  '/order-detail/',
  '/order-detail.html',
  '/order-success',
  '/order-success.html'
]);

export function shouldServeCanonicalAliasDirectly(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  return DIRECT_INTERNAL_ALIAS_PATHS.has(raw);
}

export function normalizeCanonicalPath(pathname) {
  let p = String(pathname || '/').trim() || '/';
  p = CANONICAL_ALIAS_MAP.get(p) || p;

  if (
    p.length > 1 &&
    p.endsWith('/') &&
    !p.startsWith('/admin/') &&
    !p.startsWith('/api/')
  ) {
    p = p.slice(0, -1);
  }
  return p || '/';
}

export function getCanonicalRedirectPath(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  if (raw === '/admin/' || raw === '/api/') return null;
  if (raw.startsWith('/admin/') || raw.startsWith('/api/')) return null;
  if (raw === '/blog/' || raw === '/forum/' || raw === '/products/') return null;
  if (shouldServeCanonicalAliasDirectly(raw)) return null;
  const normalized = normalizeCanonicalPath(raw);
  return normalized !== raw ? normalized : null;
}
