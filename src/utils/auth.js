/**
 * Auth utilities for admin session management
 */

const ADMIN_COOKIE = 'admin_session';
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Base64URL encoding
 */
function base64url(bytes) {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * HMAC-SHA256 signature
 */
async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

/**
 * Get cookie value by name
 */
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return rest.join('=') || '';
  }
  return null;
}

/**
 * Verify if the request is from an authenticated admin
 */
export async function isAdminAuthed(req, env) {
  const cookieHeader = req.headers.get('Cookie') || '';
  const value = getCookieValue(cookieHeader, ADMIN_COOKIE);
  if (!value) return false;

  const [tsStr, sig] = value.split('.');
  if (!tsStr || !sig) return false;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;

  const ageSec = Math.floor((Date.now() - ts) / 1000);
  if (ageSec < 0 || ageSec > ADMIN_MAX_AGE_SECONDS) return false;

  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return false;

  const expected = await hmacSha256(secret, tsStr);
  return expected === sig;
}

/**
 * Create an admin session cookie
 */
export async function createAdminSessionCookie(env) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  
  const tsStr = String(Date.now());
  const sig = await hmacSha256(env.ADMIN_SESSION_SECRET, tsStr);
  const cookieVal = `${tsStr}.${sig}`;
  
  return `${ADMIN_COOKIE}=${cookieVal}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ADMIN_MAX_AGE_SECONDS}`;
}

/**
 * Create a logout cookie (expired)
 */
export function createLogoutCookie() {
  return `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
