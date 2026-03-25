// Cache for Whop config to reduce DB queries
let whopConfigCache = null;
let whopConfigCacheTime = 0;
const CACHE_TTL = 300000; // 5 minutes

/**
 * Helper functions for fetching API keys and secrets from DB/environment
 *
 * Priority order for Whop credentials:
 * 1. Environment variables (WHOP_API_KEY, WHOP_WEBHOOK_SECRET) - RECOMMENDED
 * 2. payment_gateways table (new universal system)
 * 3. settings table (legacy - for backward compatibility)
 */

/**
 * Get Whop API key - Priority: env > payment_gateways > legacy settings
 * @param {Object} env - Environment bindings
 * @returns {Promise<string|null>}
 */
export async function getWhopApiKey(env) {
  // 1. First check environment variable (RECOMMENDED - most secure)
  if (env.WHOP_API_KEY) {
    return env.WHOP_API_KEY;
  }

  // 2. Check payment_gateways table (new universal system)
  try {
    if (env.DB) {
      const gateway = await env.DB.prepare(
        `SELECT whop_api_key
         FROM payment_gateways
         WHERE gateway_type = ?
           AND is_enabled = 1
           AND whop_api_key IS NOT NULL
           AND TRIM(whop_api_key) != ''
         ORDER BY id DESC
         LIMIT 1`
      ).bind('whop').first();
      if (gateway && gateway.whop_api_key) {
        return gateway.whop_api_key;
      }
    }
  } catch (e) {
    console.error('Error reading API key from payment_gateways:', e);
  }

  // 3. Fallback to legacy settings table
  try {
    if (env.DB) {
      const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('whop').first();
      if (row && row.value) {
        const settings = JSON.parse(row.value);
        if (settings.api_key) {
          return settings.api_key;
        }
      }
    }
  } catch (e) {
    console.error('Error reading API key from legacy settings:', e);
  }

  return null;
}

/**
 * Get Whop webhook secret - Priority: env > payment_gateways > legacy settings
 * @param {Object} env - Environment bindings
 * @returns {Promise<string|null>}
 */
export async function getWhopWebhookSecret(env) {
  // 1. First check environment variable (RECOMMENDED - most secure)
  if (env.WHOP_WEBHOOK_SECRET) {
    return env.WHOP_WEBHOOK_SECRET;
  }

  // 2. Check payment_gateways table (new universal system)
  try {
    if (env.DB) {
      const gateway = await env.DB.prepare(
        `SELECT webhook_secret
         FROM payment_gateways
         WHERE gateway_type = ?
           AND is_enabled = 1
           AND webhook_secret IS NOT NULL
           AND TRIM(webhook_secret) != ''
         ORDER BY id DESC
         LIMIT 1`
      ).bind('whop').first();
      if (gateway && gateway.webhook_secret) {
        return gateway.webhook_secret;
      }
    }
  } catch (e) {
    console.error('Error reading webhook secret from payment_gateways:', e);
  }

  // 3. Fallback to legacy settings table
  try {
    if (env.DB) {
      const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('whop').first();
      if (row && row.value) {
        const settings = JSON.parse(row.value);
        if (settings.webhook_secret) {
          return settings.webhook_secret;
        }
      }
    }
  } catch (e) {
    console.error('Error reading webhook secret from legacy settings:', e);
  }

  return null;
}

/**
 * Get Google Apps Script URL for email webhooks from database settings
 * @param {Object} env - Environment bindings
 * @returns {Promise<string|null>}
 */
export async function getGoogleScriptUrl(env) {
  try {
    if (env.DB) {
      const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('whop').first();
      if (row && row.value) {
        const settings = JSON.parse(row.value);
        if (settings.google_webapp_url) {
          return settings.google_webapp_url;
        }
      }
    }
  } catch (e) {
    console.warn('Error reading Google Script URL from database:', e);
  }
  return null;
}
