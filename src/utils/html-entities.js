/**
 * HTML Entity Encoding/Decoding Utilities
 * Consolidated from all duplicates across the codebase
 */

// Primary HTML escape function
export function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Decode basic HTML entities (for sanitization)
export function decodeBasicHtmlEntities(value) {
  let decoded = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    const next = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

// Decode XML entities (for sitemap)
export function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Escape HTML attributes (for data attributes)
export function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Simple HTML strip (for excerpts)
export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function replaceLegacyBrandTokens(text, siteTitle) {
  if (!text) return text;
  const title = siteTitle || 'WishVideo';
  return String(text)
    .replace(/\{\{SITE_TITLE\}\}/gi, title)
    .replace(/\{\{BRAND\}\}/gi, title)
    .replace(/\{\{SITE_NAME\}\}/gi, title);
}
