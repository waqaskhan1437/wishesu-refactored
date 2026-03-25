/**
 * JSON Utilities
 * Consolidated JSON stringify with HTML escape
 */

export function stringifyJson(payload) {
  return JSON.stringify(payload || {}).replace(/</g, '\\u003c');
}

export function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

export function safeJsonParseArray(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}
