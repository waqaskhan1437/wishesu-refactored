/**
 * Central constants - Shared across all modules
 */

// Application version - used for cache busting and debug info.
// NOTE: Wrangler `[vars] VERSION` is provided at runtime via `env.VERSION`,
// so the entrypoint should call `setVersion(env.VERSION)` per request.
export let VERSION = "15";

export function setVersion(value) {
  const v = value === undefined || value === null ? '' : String(value).trim();
  if (v) VERSION = v;
}

// Rate limiting defaults
export const RATE_LIMIT = {
  CHAT_MSG_PER_SEC: 1,
  MAX_CHAT_MSG_LENGTH: 500
};

// File size limits
export const FILE_SIZE_LIMITS = {
  VIDEO_MAX_MB: 500,
  FILE_MAX_MB: 10
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200
};
