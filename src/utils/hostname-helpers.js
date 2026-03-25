/**
 * Hostname & Request Utilities
 * Consolidated hostname detection and request helpers
 */

export function isLocalHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}

export function isLocalDevHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function getCanonicalHostname(url, env) {
  const configured = String(env?.CANONICAL_HOST || '').trim().toLowerCase();
  if (configured) return configured;
  const current = String(url?.hostname || '').toLowerCase();
  if (current.startsWith('www.')) return current.slice(4);
  return current;
}

export function isInsecureRequest(url, req) {
  const forwardedProto = String(req.headers.get('x-forwarded-proto') || '').toLowerCase();
  if (forwardedProto) return forwardedProto !== 'https';
  return url.protocol !== 'https:';
}

export function normalizeSeoBaseUrl(rawBaseUrl, reqUrl, env) {
  let base = null;
  try {
    const raw = String(rawBaseUrl || '').trim();
    base = raw ? new URL(raw) : new URL(reqUrl.toString());
  } catch (_) {
    base = new URL(reqUrl.toString());
  }

  const canonicalHost = getCanonicalHostname(base, env) || getCanonicalHostname(reqUrl, env) || base.hostname;
  if (canonicalHost) base.hostname = canonicalHost;

  if (!isLocalHostname(base.hostname)) {
    base.protocol = 'https:';
    if (base.port === '80' || base.port === '443') base.port = '';
  }

  base.pathname = '';
  base.search = '';
  base.hash = '';
  return base.origin;
}
