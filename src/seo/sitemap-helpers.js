/**
 * Sitemap Helpers - URL Normalization
 * Sitemap-related utilities
 */

import { decodeXmlEntities } from '../utils/html-entities.js';
import { normalizeCanonicalPath } from '../routing/path-aliases.js';
import { buildMinimalSitemapXml } from '../controllers/seo-minimal.js';

const SITEMAP_MEMBERSHIP_TTL_MS = 2 * 60 * 1000;
const sitemapMembershipCache = {
  fetchedAt: 0,
  urls: null
};

export function normalizeUrlForSitemapCompare(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const protocol = String(u.protocol || '').toLowerCase() || 'https:';
    const host = String(u.hostname || '').toLowerCase();
    if (!host) return '';

    const includePort = Boolean(
      u.port &&
      !((protocol === 'https:' && u.port === '443') || (protocol === 'http:' && u.port === '80'))
    );
    const port = includePort ? `:${u.port}` : '';
    const path = normalizeCanonicalPath(u.pathname || '/');
    return `${protocol}//${host}${port}${path}`;
  } catch (_) {
    return '';
  }
}

export async function getSitemapMembershipSet(env, req) {
  const now = Date.now();
  if (sitemapMembershipCache.urls && (now - sitemapMembershipCache.fetchedAt) < SITEMAP_MEMBERSHIP_TTL_MS) {
    return sitemapMembershipCache.urls;
  }

  const out = new Set();
  try {
    const sitemap = await buildMinimalSitemapXml(env, req);
    const xml = String(sitemap?.body || '');
    const re = /<loc>([\s\S]*?)<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const decoded = decodeXmlEntities(m[1]);
      const normalized = normalizeUrlForSitemapCompare(decoded);
      if (normalized) out.add(normalized);
    }
  } catch (_) {
    // On failure, keep set empty and fallback-safe behavior in caller.
  }

  sitemapMembershipCache.urls = out;
  sitemapMembershipCache.fetchedAt = now;
  return out;
}

export async function isCanonicalInSitemap(env, req, canonicalUrl) {
  const normalizedCanonical = normalizeUrlForSitemapCompare(canonicalUrl);
  if (!normalizedCanonical) return true;

  const sitemapUrls = await getSitemapMembershipSet(env, req);
  if (!sitemapUrls || sitemapUrls.size === 0) return true;

  return sitemapUrls.has(normalizedCanonical);
}
