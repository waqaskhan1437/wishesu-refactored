/**
 * HTML Sanitizer
 * Product description sanitization
 */

import { escapeHtmlText, decodeBasicHtmlEntities } from './html-entities.js';

export const ALLOWED_PRODUCT_DESCRIPTION_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'hr', 'span'
]);

export function sanitizeProductDescriptionHtml(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'No description available.';

  const hasMarkupHint = /<[a-z!/][^>]*>/i.test(raw) || /&lt;[a-z!/]/i.test(raw);
  if (!hasMarkupHint) {
    return escapeHtmlText(raw).replace(/\n/g, '<br>');
  }

  let html = decodeBasicHtmlEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  html = html.replace(/<[^>]*>/g, (tag) => {
    if (/^<!--/.test(tag)) return '';

    const closeMatch = tag.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
    if (closeMatch) {
      const tagName = String(closeMatch[1] || '').toLowerCase();
      return ALLOWED_PRODUCT_DESCRIPTION_TAGS.has(tagName) ? `</${tagName}>` : '';
    }

    const openMatch = tag.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
    if (!openMatch) return '';

    const tagName = String(openMatch[1] || '').toLowerCase();
    if (!ALLOWED_PRODUCT_DESCRIPTION_TAGS.has(tagName)) return '';

    if (tagName === 'br' || tagName === 'hr') return `<${tagName}>`;

    if (tagName === 'a') {
      const attrs = String(openMatch[2] || '');
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const targetMatch = attrs.match(/\btarget\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);

      const hrefRaw = String(
        (hrefMatch && (hrefMatch[1] || hrefMatch[2] || hrefMatch[3])) || '#'
      ).trim();
      const safeHref = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(hrefRaw) ? hrefRaw : '#';

      const targetRaw = String(
        (targetMatch && (targetMatch[1] || targetMatch[2] || targetMatch[3])) || ''
      ).trim().toLowerCase();

      if (targetRaw === '_blank') {
        return `<a href="${escapeHtmlText(safeHref)}" target="_blank" rel="noopener noreferrer">`;
      }
      return `<a href="${escapeHtmlText(safeHref)}">`;
    }

    return `<${tagName}>`;
  });

  const cleaned = html.trim();
  return cleaned || 'No description available.';
}
