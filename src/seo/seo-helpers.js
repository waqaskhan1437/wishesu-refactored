/**
 * SEO Helpers - Settings & Site Title
 * SEO-specific helper functions
 */

import { escapeHtmlText, replaceLegacyBrandTokens } from '../utils/html-entities.js';
import { getCanonicalHostname, normalizeSeoBaseUrl, isLocalHostname } from '../utils/hostname-helpers.js';
import { normalizeCanonicalPath } from '../routing/path-aliases.js';
import { getMinimalSEOSettings } from '../controllers/seo-minimal.js';

export function resolveFallbackSiteTitle(urlObj) {
  const host = String(urlObj?.hostname || '').replace(/^www\./i, '').trim();
  return host || 'prankwish.com';
}

export async function getSeoSettingsObject(env) {
  try {
    const response = await getMinimalSEOSettings(env);
    if (response && typeof response.json === 'function') {
      const parsed = await response.json();
      if (parsed && parsed.settings && typeof parsed.settings === 'object') {
        return parsed.settings;
      }
    } else if (response && response.settings && typeof response.settings === 'object') {
      return response.settings;
    }
  } catch (_) {}
  return {};
}

export function resolveSiteTitle(seoSettings, urlObj) {
  const configured = String(seoSettings?.site_title || '').trim();
  if (configured) return configured;
  return resolveFallbackSiteTitle(urlObj);
}

export function applySiteTitleToHtml(html, siteTitle) {
  if (!html || !siteTitle) return html;
  const safeSiteTitle = escapeHtmlText(siteTitle);
  return html.replace(/<title>([\s\S]*?)<\/title>/i, (match, currentTitle) => {
    const rewritten = replaceLegacyBrandTokens(currentTitle, safeSiteTitle);
    if (rewritten === currentTitle) return match;
    return `<title>${rewritten}</title>`;
  });
}

export function replaceLegacyBrandTokensInText(text, siteTitle) {
  return replaceLegacyBrandTokens(text, siteTitle);
}
