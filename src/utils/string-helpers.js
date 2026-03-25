/**
 * String Utilities
 * Common string manipulation functions
 */

export function truncateText(value, maxLength = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function capitalizeFirst(text) {
  const s = String(text || '');
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseInteger(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeSsrInteger(value, fallback, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeSsrIdList(idsInput = []) {
  if (!Array.isArray(idsInput)) return [];
  return idsInput
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 50);
}
