/**
 * SEO Tags - Robots, Canonical, Meta Tags
 * SEO tag generation and injection
 */

import { getSeoSettingsObject, resolveSiteTitle } from './seo-helpers.js';
import { normalizeCanonicalPath } from '../routing/path-aliases.js';
import { normalizeSeoBaseUrl } from '../utils/hostname-helpers.js';
import { canonicalProductPath } from '../utils/formatting.js';
import { getSeoVisibilityRuleMatch } from '../controllers/noindex.js';
import { injectIntoHead } from '../utils/html-injector.js';

export function isSensitiveNoindexPath(pathname) {
  const p = normalizeCanonicalPath(pathname);
  if (
    p === '/checkout' ||
    p === '/success' ||
    p === '/buyer-order' ||
    p === '/order-detail'
  ) {
    return true;
  }
  if (p === '/admin' || p.startsWith('/admin/')) return true;
  if (p === '/api' || p.startsWith('/api/')) return true;
  if (p === '/order' || p.startsWith('/order/')) return true;
  if (p === '/download' || p.startsWith('/download/')) return true;
  return false;
}

export function applySeoToHtml(html, robots, canonical) {
  if (!html) return html;
  let out = String(html);
  if (!/<head[\s>]/i.test(out)) {
    if (/<html[^>]*>/i.test(out)) {
      out = out.replace(/<html([^>]*)>/i, '<html$1>\n<head>\n</head>');
    } else if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, '<head>\n</head>\n<body$1>');
    } else {
      out = `<head>\n</head>\n${out}`;
    }
  }
  if (!/<\/head>/i.test(out)) {
    if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, '</head>\n<body$1>');
    } else {
      out = `${out}\n</head>`;
    }
  }

  if (robots) {
    const robotsRegex = /<meta\s+name=["']robots["'][^>]*>/i;
    const robotsTag = `<meta name="robots" content="${robots}">`;
    if (robotsRegex.test(out)) {
      out = out.replace(robotsRegex, robotsTag);
    } else {
      out = injectIntoHead(out, robotsTag);
    }
  }

  if (canonical) {
    const canonicalRegex = /<link\s+rel=["']canonical["'][^>]*>/i;
    const canonicalTag = `<link rel="canonical" href="${canonical}">`;
    if (canonicalRegex.test(out)) {
      out = out.replace(canonicalRegex, canonicalTag);
    } else {
      out = injectIntoHead(out, canonicalTag);
    }
  }

  const faviconRegex = /<link\s+rel=["'](?:icon|shortcut icon)["'][^>]*>/i;
  if (!faviconRegex.test(out)) {
    const faviconTags = `<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n<link rel="icon" href="/favicon.ico" sizes="any">`;
    out = injectIntoHead(out, faviconTags);
  }
  return out;
}

export async function getSeoForRequest(env, req, opts = {}) {
  const url = new URL(req.url);
  const rawPathname = opts.path || url.pathname || '/';
  const pathname = normalizeCanonicalPath(rawPathname);
  const seoSettings = await getSeoSettingsObject(env);
  const siteTitle = resolveSiteTitle(seoSettings, url);

  const configuredBaseUrl = (seoSettings && seoSettings.site_url && String(seoSettings.site_url).trim())
    ? String(seoSettings.site_url).trim()
    : url.origin;
  const baseUrl = normalizeSeoBaseUrl(configuredBaseUrl, url, env);

  let canonical = '';
  if (opts.product) {
    const product = opts.product;
    if (product.seo_canonical && String(product.seo_canonical).trim()) {
      canonical = String(product.seo_canonical).trim();
    } else {
      try {
        canonical = baseUrl + canonicalProductPath(product);
      } catch (e) {
        canonical = baseUrl + normalizeCanonicalPath(pathname);
      }
    }
  } else {
    canonical = baseUrl + normalizeCanonicalPath(pathname);
  }

  let robots = 'index, follow';
  if (isSensitiveNoindexPath(pathname)) {
    robots = 'noindex, nofollow';
  } else {
    try {
      const explicitRule = await getSeoVisibilityRuleMatch(env, {
        pathname,
        rawPathname,
        url,
        requestUrl: req.url
      });

      if (explicitRule === 'index') {
        robots = 'index, follow';
      } else if (explicitRule === 'noindex') {
        robots = 'noindex, nofollow';
      } else {
        const inSitemap = true;
        robots = inSitemap ? 'index, follow' : 'noindex, nofollow';
      }
    } catch (e) {
      // ignore errors and fall back to default
    }
  }

  return { robots, canonical, siteTitle };
}
