/**
 * Global Components SSR - Header/Footer Injection
 * Global header/footer component injection for SSR
 */

import { normalizeCanonicalPath } from '../routing/path-aliases.js';
import { initDB } from '../config/db.js';
import { safeJsonParse } from '../utils/json-helpers.js';

const SITE_COMPONENTS_SSR_TTL_MS = 10 * 1000;
const siteComponentsSsrCache = {
  value: null,
  fetchedAt: 0,
  hasValue: false
};

export function ensureGlobalComponentsRuntimeScript(html) {
  if (!html) return html;
  const source = String(html);
  if (!/<body[^>]*>/i.test(source)) return source;
  if (/global-components\.js/i.test(source)) return source;
  return source.replace(
    /<body([^>]*)>/i,
    '<body$1>\n<script defer src="/js/global-components.js"></script>'
  );
}

export function upsertBodyDataAttribute(html, attrName, attrValue = '1') {
  if (!html || !attrName) return html;
  return String(html).replace(/<body([^>]*)>/i, (match, attrs = '') => {
    const attrRe = new RegExp(`\\s${attrName}=(["']).*?\\1`, 'i');
    if (attrRe.test(attrs)) {
      return `<body${attrs.replace(attrRe, ` ${attrName}="${attrValue}"`)}>`;
    }
    return `<body${attrs} ${attrName}="${attrValue}">`;
  });
}

export function hasGlobalHeaderMarkup(html) {
  const source = String(html || '');
  if (/id=["']global-header["']/i.test(source)) return true;
  return /class=["'][^"']*\bsite-header\b[^"']*["']/i.test(source);
}

export function hasGlobalFooterMarkup(html) {
  const source = String(html || '');
  if (/id=["']global-footer["']/i.test(source)) return true;
  return /class=["'][^"']*\bsite-footer\b[^"']*["']/i.test(source);
}

export function injectMarkupIntoSlot(html, slotId, markup) {
  if (!html || !slotId || !markup) return html;
  const slotRe = new RegExp(
    `<([a-zA-Z0-9:-]+)([^>]*)\\bid=["']${slotId}["']([^>]*)>[\\s\\S]*?<\\/\\1>`,
    'i'
  );
  if (!slotRe.test(html)) return html;
  return String(html).replace(slotRe, (_full, tagName, before = '', after = '') => {
    const attrsBase = `${before} id="${slotId}"${after}`;
    const attrs = /\bdata-injected\s*=/.test(attrsBase)
      ? attrsBase
      : `${attrsBase} data-injected="1"`;
    return `<${tagName}${attrs}>${markup}</${tagName}>`;
  });
}

export function injectGlobalHeaderSsr(html, headerCode) {
  if (!html || !headerCode || hasGlobalHeaderMarkup(html)) return html;
  const withSlot = injectMarkupIntoSlot(html, 'global-header-slot', headerCode);
  if (withSlot !== html) return withSlot;
  if (!/<body[^>]*>/i.test(html)) return html;
  return String(html).replace(
    /<body([^>]*)>/i,
    `<body$1>\n<div id="global-header">${headerCode}</div>`
  );
}

export function injectGlobalFooterSsr(html, footerCode) {
  if (!html || !footerCode || hasGlobalFooterMarkup(html)) return html;
  const withSlot = injectMarkupIntoSlot(html, 'global-footer-slot', footerCode);
  if (withSlot !== html) return withSlot;
  const source = String(html);
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `<div id="global-footer">${footerCode}</div>\n</body>`);
  }
  return `${source}\n<div id="global-footer">${footerCode}</div>`;
}

export function isExcludedFromGlobalComponents(excludedPages, pathname) {
  if (!Array.isArray(excludedPages) || excludedPages.length === 0) return false;
  const path = String(pathname || '/');
  for (const item of excludedPages) {
    const excluded = String(item || '').trim();
    if (!excluded) continue;
    if (excluded === path) return true;
    if (excluded.endsWith('/') && path.startsWith(excluded)) return true;
    if (path.startsWith(excluded + '/')) return true;
  }
  return false;
}

export function isTransactionalGlobalComponentsPath(pathname) {
  const normalized = normalizeCanonicalPath(pathname || '/');
  return (
    normalized === '/checkout' ||
    normalized === '/success' ||
    normalized === '/buyer-order' ||
    normalized === '/order-detail'
  );
}

export function resolveDefaultComponentCode(components, type) {
  if (!components || typeof components !== 'object') return '';
  const isHeader = type === 'header';
  const list = Array.isArray(isHeader ? components.headers : components.footers)
    ? (isHeader ? components.headers : components.footers)
    : [];
  const defaultId = isHeader ? components.defaultHeaderId : components.defaultFooterId;
  if (!defaultId) return '';
  const match = list.find((entry) => String(entry?.id || '') === String(defaultId));
  return String(match?.code || '').trim();
}

export async function getSiteComponentsForSsr(env) {
  if (!env?.DB) return null;
  const now = Date.now();

  if (siteComponentsSsrCache.hasValue && (now - siteComponentsSsrCache.fetchedAt) < SITE_COMPONENTS_SSR_TTL_MS) {
    return siteComponentsSsrCache.value;
  }
  try {
    await initDB(env);
    const row = await env.DB.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind('site_components').first();

    let parsed = null;
    if (row && row.value) {
      parsed = safeJsonParse(row.value, null);
    }

    siteComponentsSsrCache.value = parsed;
    siteComponentsSsrCache.fetchedAt = now;
    siteComponentsSsrCache.hasValue = true;
    return parsed;
  } catch (error) {
    console.warn('Failed to load site components for SSR:', error);
    if (siteComponentsSsrCache.hasValue) return siteComponentsSsrCache.value;
    siteComponentsSsrCache.value = null;
    siteComponentsSsrCache.fetchedAt = now;
    siteComponentsSsrCache.hasValue = true;
    return null;
  }
}

export async function applyGlobalComponentsSsr(env, html, pathname) {
  const currentPath = String(pathname || '/');
  const normalizedPath = normalizeCanonicalPath(currentPath);
  if (
    !html ||
    !/<body[^>]*>/i.test(html) ||
    normalizedPath === '/admin' ||
    normalizedPath.startsWith('/admin/') ||
    isTransactionalGlobalComponentsPath(normalizedPath)
  ) {
    return html;
  }

  let out = ensureGlobalComponentsRuntimeScript(html);
  if (!env?.DB) return out;

  const components = await getSiteComponentsForSsr(env);
  if (!components || typeof components !== 'object') return out;
  if (
    isExcludedFromGlobalComponents(components.excludedPages, currentPath) ||
    isExcludedFromGlobalComponents(components.excludedPages, normalizedPath)
  ) {
    return out;
  }

  const enableHeader = components?.settings?.enableGlobalHeader !== false;
  const enableFooter = components?.settings?.enableGlobalFooter !== false;
  const headerCode = enableHeader ? resolveDefaultComponentCode(components, 'header') : '';
  const footerCode = enableFooter ? resolveDefaultComponentCode(components, 'footer') : '';

  let injectedHeader = false;
  let injectedFooter = false;

  if (headerCode && !hasGlobalHeaderMarkup(out)) {
    const withHeader = injectGlobalHeaderSsr(out, headerCode);
    injectedHeader = withHeader !== out;
    out = withHeader;
  }

  if (footerCode && !hasGlobalFooterMarkup(out)) {
    const withFooter = injectGlobalFooterSsr(out, footerCode);
    injectedFooter = withFooter !== out;
    out = withFooter;
  }

  if (injectedHeader || injectedFooter) {
    out = upsertBodyDataAttribute(out, 'data-components-ssr', '1');
    if (injectedHeader) out = upsertBodyDataAttribute(out, 'data-global-header-ssr', '1');
    if (injectedFooter) out = upsertBodyDataAttribute(out, 'data-global-footer-ssr', '1');
  }

  return out;
}
