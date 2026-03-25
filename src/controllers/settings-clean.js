/**
 * Clean Settings Controller 2025 - Essential Settings Only
 * Research-based minimal configuration
 */

import { json } from '../utils/response.js';

// Simple cache
let settingsCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

const DEFAULT_SETTINGS = {
  site_title: '',
  site_description: '',
  admin_email: '',
  enable_paypal: false,
  enable_stripe: false,
  paypal_client_id: '',
  paypal_secret: '',
  stripe_pub_key: '',
  stripe_secret_key: '',
  enable_rate_limit: true,
  rate_limit: 10
};

/**
 * Ensure settings table exists
 */
async function ensureTable(env) {
  if (!env.DB) return;
  
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS clean_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        site_title TEXT NOT NULL,
        site_description TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        enable_paypal INTEGER DEFAULT 0,
        enable_stripe INTEGER DEFAULT 0,
        paypal_client_id TEXT,
        paypal_secret TEXT,
        stripe_pub_key TEXT,
        stripe_secret_key TEXT,
        enable_rate_limit INTEGER DEFAULT 1,
        rate_limit INTEGER DEFAULT 10
      )
    `).run();

    // Add missing columns for older schemas
    const columns = [
      ['site_title', "TEXT DEFAULT ''"],
      ['site_description', "TEXT DEFAULT ''"],
      ['admin_email', "TEXT DEFAULT ''"],
      ['enable_paypal', 'INTEGER DEFAULT 0'],
      ['enable_stripe', 'INTEGER DEFAULT 0'],
      ['paypal_client_id', "TEXT DEFAULT ''"],
      ['paypal_secret', "TEXT DEFAULT ''"],
      ['stripe_pub_key', "TEXT DEFAULT ''"],
      ['stripe_secret_key', "TEXT DEFAULT ''"],
      ['enable_rate_limit', 'INTEGER DEFAULT 1'],
      ['rate_limit', 'INTEGER DEFAULT 10']
    ];
    for (const [col, def] of columns) {
      try {
        await env.DB.prepare(`ALTER TABLE clean_settings ADD COLUMN ${col} ${def}`).run();
      } catch (e) {
        // Column already exists, ignore
      }
    }
  } catch (e) {
    console.error('Settings table error:', e);
  }
}

async function upsertCleanSettings(env, settings) {
  await env.DB.prepare(`
      INSERT OR REPLACE INTO clean_settings (
        id, site_title, site_description, admin_email, enable_paypal, enable_stripe,
        paypal_client_id, paypal_secret, stripe_pub_key, stripe_secret_key,
        enable_rate_limit, rate_limit
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
    settings.site_title,
    settings.site_description,
    settings.admin_email,
    settings.enable_paypal,
    settings.enable_stripe,
    settings.paypal_client_id,
    settings.paypal_secret,
    settings.stripe_pub_key,
    settings.stripe_secret_key,
    settings.enable_rate_limit,
    settings.rate_limit
  ).run();
}

async function migrateLegacyPayPalToClean(env, settings) {
  let legacy = null;
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('paypal').first();
    if (row?.value) {
      legacy = JSON.parse(row.value);
    }
  } catch (e) {
    return settings;
  }

  const cleanHasPayPal = !!(settings.paypal_client_id || settings.paypal_secret);
  const legacyHasPayPal = !!(legacy && (legacy.client_id || legacy.secret));

  if (cleanHasPayPal || !legacyHasPayPal) {
    return settings;
  }

  const legacyEnabled = typeof legacy.enabled === 'boolean'
    ? legacy.enabled
    : !!(legacy.client_id || legacy.secret);

  const migrated = {
    ...settings,
    enable_paypal: legacyEnabled ? 1 : 0,
    paypal_client_id: legacy.client_id || '',
    paypal_secret: legacy.secret || ''
  };

  try {
    await upsertCleanSettings(env, migrated);
  } catch (e) {
    console.error('Failed to migrate legacy PayPal settings:', e);
    return settings;
  }

  return migrated;
}

async function syncPayPalToLegacySettings(env, settings) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('paypal').first();
    const legacy = row?.value ? JSON.parse(row.value) : {};

    const merged = {
      ...legacy,
      client_id: settings.paypal_client_id || '',
      secret: settings.paypal_secret || '',
      enabled: !!settings.enable_paypal,
      mode: legacy.mode || 'sandbox'
    };

    await env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).bind('paypal', JSON.stringify(merged)).run();
  } catch (e) {
    console.error('Failed to sync PayPal settings to legacy table:', e);
  }
}

/**
 * Get clean settings with cache
 */
export async function getCleanSettings(env) {
  const now = Date.now();
  if (settingsCache && (now - cacheTime) < CACHE_TTL) {
    return settingsCache;
  }

  await ensureTable(env);

  try {
    const row = await env.DB.prepare('SELECT * FROM clean_settings WHERE id = 1').first();
    let settings = { ...DEFAULT_SETTINGS, ...(row || {}) };
    settings = await migrateLegacyPayPalToClean(env, settings);
    settingsCache = settings;
    cacheTime = now;
    return settingsCache;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

/**
 * API: Get clean settings
 */
export async function getCleanSettingsApi(env) {
  try {
    const settings = await getCleanSettings(env);
    // Mask sensitive data
    const safeSettings = {
      ...settings,
      paypal_secret: settings.paypal_secret ? '••••••••' : '',
      stripe_secret_key: settings.stripe_secret_key ? '••••••••' : ''
    };
    return json({ success: true, settings: safeSettings });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * API: Save clean settings
 */
export async function saveCleanSettingsApi(env, body) {
  try {
    await ensureTable(env);

    const current = await getCleanSettings(env);
    
    const settings = {
      site_title: (body.site_title || '').trim(),
      site_description: (body.site_description || '').trim().substring(0, 160),
      admin_email: (body.admin_email || '').trim(),
      enable_paypal: body.enable_paypal ? 1 : 0,
      enable_stripe: body.enable_stripe ? 1 : 0,
      paypal_client_id: (body.paypal_client_id || '').trim(),
      paypal_secret: (body.paypal_secret || '').trim(),
      stripe_pub_key: (body.stripe_pub_key || '').trim(),
      stripe_secret_key: (body.stripe_secret_key || '').trim(),
      enable_rate_limit: body.enable_rate_limit ? 1 : 0,
      rate_limit: Math.max(1, Math.min(100, parseInt(body.rate_limit) || 10))
    };

    // Preserve masked values
    if (settings.paypal_secret === '••••••••') {
      settings.paypal_secret = current.paypal_secret;
    }
    if (settings.stripe_secret_key === '••••••••') {
      settings.stripe_secret_key = current.stripe_secret_key;
    }

    await upsertCleanSettings(env, settings);
    await syncPayPalToLegacySettings(env, settings);

    settingsCache = null; // Clear cache

    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
