/**
 * Feature Flags Utilities
 * Consolidated feature flag detection
 */

export function isEnabledFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isNoJsSsrEnabled(env) {
  return isEnabledFlag(env?.ENABLE_NOJS_SSR) || isEnabledFlag(env?.NOJS_SSR) || isEnabledFlag(env?.NOJS_MODE);
}
