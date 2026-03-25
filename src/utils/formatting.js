/**
 * Text formatting and conversion utilities
 */

/**
 * Escape HTML special characters
 * @param {string} input
 * @returns {string}
 */
export function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Convert text to URL-safe slug
 * @param {string} input
 * @returns {string}
 */
export function slugifyStr(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Generate canonical product path
 * @param {Object} product
 * @returns {string}
 */
export function canonicalProductPath(product) {
  const id = product && product.id != null ? String(product.id) : '';
  const slug = (product && product.slug) ? String(product.slug) : slugifyStr(product && product.title ? product.title : 'product');
  return `/product-${id}/${encodeURIComponent(slug)}`;
}

/**
 * Normalize quick action text for comparison
 * @param {string} text
 * @returns {string}
 */
export function normalizeQuickAction(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Convert SQLite datetime to ISO 8601 format
 * @param {string} sqliteDate
 * @returns {string|null}
 */
export function toISO8601(sqliteDate) {
  if (!sqliteDate) return null;
  const d = new Date(sqliteDate.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? sqliteDate : d.toISOString();
}

/**
 * Convert datetime fields in an object to ISO 8601
 * @param {Object} row - Database row
 * @param {Array<string>} fields - Fields to convert
 * @returns {Object}
 */
export function convertDatetimeFields(row, fields) {
  if (!row) return row;
  const result = { ...row };
  for (const field of fields) {
    if (result[field]) {
      result[field] = toISO8601(result[field]);
    }
  }
  return result;
}

/**
 * Normalize Archive.org metadata value
 * @param {*} value
 * @returns {string}
 */
export function normalizeArchiveMetaValue(value) {
  return (value || '').toString().replace(/[\r\n\t]+/g, ' ').trim();
}
