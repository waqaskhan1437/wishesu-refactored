/**
 * SEO Visibility Rules Controller
 * Supports both:
 * - noindex rules (hide from search)
 * - index rules (force-allow for specific URLs when wildcard noindex exists)
 */

import { json } from '../utils/response.js';
import { buildMinimalSitemapXml } from './seo-minimal.js';
import { canonicalProductPath } from '../utils/formatting.js';

const CACHE_TTL = 60000;
const EMPTY_RULES = Object.freeze({ noindex: [], index: [] });
const PREVIEW_LIMIT = 250;

let rulesCache = null;
let cacheTime = 0;

function clearRulesCache() {
  rulesCache = null;
  cacheTime = 0;
}

function normalizePath(value) {
  let p = String(value || '').trim();
  if (!p) return '/';
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function normalizeComparableUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const protocol = String(u.protocol || '').toLowerCase() || 'https:';
    const host = String(u.host || '').toLowerCase();
    const pathname = normalizePath(u.pathname || '/');
    return `${protocol}//${host}${pathname}`;
  } catch (_) {
    return '';
  }
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function isSensitiveNoindexPath(pathname) {
  const p = normalizePath(pathname);
  if (p === '/admin' || p.startsWith('/admin/')) return true;
  if (p === '/api' || p.startsWith('/api/')) return true;
  if (p === '/checkout' || p === '/success' || p === '/buyer-order' || p === '/order-detail') return true;
  if (p === '/order' || p.startsWith('/order/')) return true;
  if (p === '/download' || p.startsWith('/download/')) return true;
  return false;
}

function pushCandidate(list, seen, url, source) {
  const normalized = normalizeComparableUrl(url);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push({
    url: normalized,
    source: String(source || 'detected')
  });
}

async function buildSitemapIndex(env, req) {
  const index = new Set();
  const sitemapUrls = [];
  try {
    const sm = await buildMinimalSitemapXml(env, req);
    const xml = String(sm?.body || '');
    const locRe = /<loc>([\s\S]*?)<\/loc>/gi;
    let m;
    while ((m = locRe.exec(xml)) !== null) {
      const decoded = decodeXmlEntities(m[1] || '');
      const normalized = normalizeComparableUrl(decoded);
      if (!normalized) continue;
      index.add(normalized);
      sitemapUrls.push(normalized);
    }
  } catch (_) {}
  return { index, sitemapUrls };
}

async function collectPreviewCandidates(env, req, sitemapUrls) {
  const reqUrl = new URL(req?.url || 'https://example.com');
  const baseOrigin = sitemapUrls[0]
    ? new URL(sitemapUrls[0]).origin
    : `${reqUrl.protocol}//${reqUrl.host}`;

  const candidates = [];
  const seen = new Set();

  const corePaths = [
    '/',
    '/products',
    '/blog',
    '/forum',
    '/contact',
    '/privacy',
    '/refund',
    '/terms',
    '/checkout',
    '/success',
    '/buyer-order',
    '/order-detail',
    '/admin'
  ];
  for (const path of corePaths) {
    pushCandidate(candidates, seen, `${baseOrigin}${path}`, 'core');
  }

  for (const url of sitemapUrls || []) {
    pushCandidate(candidates, seen, url, 'sitemap');
  }

  if (!env.DB) return candidates;

  try {
    const products = await env.DB.prepare(`
      SELECT id, title, slug, status
      FROM products
      ORDER BY id DESC
      LIMIT 300
    `).all();
    for (const p of products.results || []) {
      const path = canonicalProductPath({
        id: p.id,
        slug: p.slug,
        title: p.title || `product-${p.id}`
      });
      pushCandidate(candidates, seen, `${baseOrigin}${path}`, `product:${String(p.status || '') || 'unknown'}`);
    }
  } catch (_) {}

  try {
    const blogs = await env.DB.prepare(`
      SELECT slug, status
      FROM blogs
      ORDER BY id DESC
      LIMIT 200
    `).all();
    for (const b of blogs.results || []) {
      const slug = String(b.slug || '').trim();
      if (!slug) continue;
      pushCandidate(candidates, seen, `${baseOrigin}/blog/${encodeURIComponent(slug)}`, `blog:${String(b.status || '') || 'unknown'}`);
    }
  } catch (_) {}

  try {
    const pages = await env.DB.prepare(`
      SELECT slug, status
      FROM pages
      ORDER BY id DESC
      LIMIT 200
    `).all();
    for (const p of pages.results || []) {
      const slug = String(p.slug || '').trim();
      if (!slug) continue;
      const path = slug.startsWith('/') ? slug : `/${slug}`;
      pushCandidate(candidates, seen, `${baseOrigin}${normalizePath(path)}`, `page:${String(p.status || '') || 'unknown'}`);
    }
  } catch (_) {}

  try {
    const forum = await env.DB.prepare(`
      SELECT slug, status
      FROM forum_questions
      ORDER BY id DESC
      LIMIT 200
    `).all();
    for (const q of forum.results || []) {
      const slug = String(q.slug || '').trim();
      if (!slug) continue;
      pushCandidate(candidates, seen, `${baseOrigin}/forum/${encodeURIComponent(slug)}`, `forum:${String(q.status || '') || 'unknown'}`);
    }
  } catch (_) {}

  return candidates;
}

async function buildEffectivePreview(env, req) {
  const { index: sitemapIndex, sitemapUrls } = await buildSitemapIndex(env, req);
  const candidates = await collectPreviewCandidates(env, req, sitemapUrls);

  const indexed = [];
  const noindexed = [];

  for (const item of candidates) {
    let pathname = '/';
    try {
      pathname = normalizePath(new URL(item.url).pathname || '/');
    } catch (_) {}

    let visibility = 'none';
    try {
      visibility = await getSeoVisibilityRuleMatch(env, {
        pathname,
        rawPathname: pathname,
        url: item.url,
        requestUrl: item.url
      });
    } catch (_) {
      visibility = 'none';
    }

    let reason = '';
    let finalStatus = 'index';

    if (isSensitiveNoindexPath(pathname)) {
      finalStatus = 'noindex';
      reason = 'sensitive_path';
    } else if (visibility === 'index') {
      finalStatus = 'index';
      reason = 'force_index_rule';
    } else if (visibility === 'noindex') {
      finalStatus = 'noindex';
      reason = 'noindex_rule';
    } else if (sitemapIndex.has(item.url)) {
      finalStatus = 'index';
      reason = 'in_sitemap';
    } else {
      finalStatus = 'noindex';
      reason = 'outside_sitemap';
    }

    const row = {
      url: item.url,
      source: item.source,
      reason
    };
    if (finalStatus === 'index') indexed.push(row);
    else noindexed.push(row);
  }

  return {
    indexedTotal: indexed.length,
    noindexedTotal: noindexed.length,
    indexed: indexed.slice(0, PREVIEW_LIMIT),
    noindexed: noindexed.slice(0, PREVIEW_LIMIT)
  };
}

function normalizeRuleInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const protocol = String(u.protocol || '').toLowerCase();
      const host = String(u.host || '').toLowerCase();
      const pathname = normalizePath(u.pathname || '/');
      return `${protocol}//${host}${pathname}${u.search || ''}`;
    } catch (_) {
      return '';
    }
  }

  if (raw.startsWith('/')) {
    const [pathPart, queryPart] = raw.split('?');
    const normalizedPath = normalizePath(pathPart);
    return queryPart ? `${normalizedPath}?${queryPart}` : normalizedPath;
  }

  return '';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern, caseInsensitive = false) {
  const escaped = pattern
    .split('*')
    .map((part) => escapeRegExp(part))
    .join('.*');
  return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '');
}

function matchesPattern(value, pattern, caseInsensitive = false) {
  const val = String(value || '');
  const pat = String(pattern || '');
  if (!val || !pat) return false;

  if (!pat.includes('*')) {
    if (val === pat) return true;
    if (pat.endsWith('/') && val.startsWith(pat)) return true;
    return false;
  }

  const re = wildcardToRegex(pat, caseInsensitive);
  return re.test(val);
}

function buildCandidates(target) {
  const pathCandidates = new Set();
  const urlCandidates = new Set();

  const addPath = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const [pathOnly, query] = raw.split('?');
    const normalizedPath = normalizePath(pathOnly);
    pathCandidates.add(normalizedPath);
    pathCandidates.add(query ? `${normalizedPath}?${query}` : normalizedPath);
  };

  const addUrl = (value) => {
    try {
      const u = value instanceof URL ? value : new URL(String(value));
      const protocol = String(u.protocol || '').toLowerCase();
      const host = String(u.host || '').toLowerCase();
      const pathname = normalizePath(u.pathname || '/');
      const withQuery = `${protocol}//${host}${pathname}${u.search || ''}`;
      const withoutQuery = `${protocol}//${host}${pathname}`;
      const hostPathWithQuery = `${host}${pathname}${u.search || ''}`;
      const hostPathWithoutQuery = `${host}${pathname}`;

      urlCandidates.add(withQuery);
      urlCandidates.add(withoutQuery);
      urlCandidates.add(hostPathWithQuery);
      urlCandidates.add(hostPathWithoutQuery);
      addPath(`${pathname}${u.search || ''}`);
    } catch (_) {}
  };

  if (typeof target === 'string') {
    if (/^https?:\/\//i.test(target)) addUrl(target);
    else addPath(target);
  } else if (target && typeof target === 'object') {
    if (target.pathname) addPath(target.pathname);
    if (target.rawPathname) addPath(target.rawPathname);
    if (target.url) addUrl(target.url);
    if (target.requestUrl) addUrl(target.requestUrl);
  }

  return {
    paths: Array.from(pathCandidates),
    urls: Array.from(urlCandidates)
  };
}

function matchesRule(candidates, rule) {
  const normalizedRule = normalizeRuleInput(rule);
  if (!normalizedRule) return false;

  if (/^https?:\/\//i.test(normalizedRule)) {
    const lowerRule = normalizedRule.toLowerCase();
    return candidates.urls.some((candidate) => (
      matchesPattern(String(candidate || '').toLowerCase(), lowerRule, false)
    ));
  }

  return candidates.paths.some((candidate) => matchesPattern(candidate, normalizedRule, false));
}

function normalizeMode(value) {
  return String(value || '').toLowerCase() === 'index' ? 'index' : 'noindex';
}

async function ensureTables(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS noindex_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_pattern TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS index_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_pattern TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.error('SEO visibility table error:', e);
  }
}

async function getRulePatterns(env) {
  const now = Date.now();
  if (rulesCache && (now - cacheTime) < CACHE_TTL) return rulesCache;

  await ensureTables(env);

  try {
    const [noindexResult, indexResult] = await Promise.all([
      env.DB.prepare('SELECT url_pattern FROM noindex_pages ORDER BY id').all(),
      env.DB.prepare('SELECT url_pattern FROM index_pages ORDER BY id').all()
    ]);

    rulesCache = {
      noindex: (noindexResult.results || []).map((r) => r.url_pattern).filter(Boolean),
      index: (indexResult.results || []).map((r) => r.url_pattern).filter(Boolean)
    };
    cacheTime = now;
    return rulesCache;
  } catch (_) {
    return EMPTY_RULES;
  }
}

/**
 * API: Get rules list
 */
export async function getNoindexList(env, req) {
  try {
    const rules = await getRulePatterns(env);
    const preview = await buildEffectivePreview(env, req);
    return json({
      success: true,
      urls: rules.noindex, // backward compatibility with old dashboard
      noindexUrls: rules.noindex,
      indexUrls: rules.index,
      preview
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * API: Add SEO visibility rule
 * mode=noindex (default) | index
 */
export async function addNoindexUrl(env, body) {
  try {
    await ensureTables(env);

    const mode = normalizeMode(body?.mode);
    const rule = normalizeRuleInput(body?.url);

    if (!rule) {
      return json({ error: 'Valid URL pattern is required (relative path or full http/https URL)' }, 400);
    }

    const table = mode === 'index' ? 'index_pages' : 'noindex_pages';
    await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (url_pattern) VALUES (?)`).bind(rule).run();

    clearRulesCache();
    return json({ success: true, mode, url: rule });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * API: Remove SEO visibility rule by index
 * mode=noindex (default) | index
 */
export async function removeNoindexUrl(env, body) {
  try {
    await ensureTables(env);

    const mode = normalizeMode(body?.mode);
    const index = body?.index;
    if (typeof index !== 'number') {
      return json({ error: 'Index is required' }, 400);
    }

    const table = mode === 'index' ? 'index_pages' : 'noindex_pages';
    const result = await env.DB.prepare(`SELECT id, url_pattern FROM ${table} ORDER BY id`).all();
    const rows = result.results || [];

    if (index < 0 || index >= rows.length) {
      return json({ error: 'Pattern not found' }, 404);
    }

    const rule = rows[index].url_pattern;
    await env.DB.prepare(`DELETE FROM ${table} WHERE url_pattern = ? LIMIT 1`).bind(rule).run();

    clearRulesCache();
    return json({ success: true, mode, url: rule });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * Check if a URL should be noindexed.
 * target can be:
 * - pathname string (e.g. "/product-1/test")
 * - full URL string
 * - object: { pathname, rawPathname, url }
 */
export async function shouldNoindexUrl(env, target) {
  const visibility = await getSeoVisibilityRuleMatch(env, target);
  return visibility === 'noindex';
}

/**
 * Evaluate explicit SEO visibility rules for a URL target.
 * Returns one of: 'index' | 'noindex' | 'none'
 */
export async function getSeoVisibilityRuleMatch(env, target) {
  const rules = await getRulePatterns(env);
  const candidates = buildCandidates(target);

  // Force-index rules take precedence (useful to override wildcard noindex rules)
  for (const rule of rules.index || []) {
    if (matchesRule(candidates, rule)) return 'index';
  }

  for (const rule of rules.noindex || []) {
    if (matchesRule(candidates, rule)) return 'noindex';
  }

  return 'none';
}

/**
 * Get noindex meta tag when current request matches noindex rules
 */
export async function getNoindexMetaTags(env, target) {
  if (await shouldNoindexUrl(env, target)) {
    return '<meta name="robots" content="noindex, nofollow">';
  }
  return '';
}
