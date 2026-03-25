/**
 * Payment Gateway - Unified payment method management
 * Supports: Whop, PayPal, Stripe (future), and custom methods
 * OPTIMIZED: Added in-memory caching
 */

import { json, cachedJson } from '../utils/response.js';
import { getWhopApiKey } from '../config/secrets.js';

// In-memory cache for payment methods
let paymentMethodsCache = null;
let paymentMethodsCacheTime = 0;
const PAYMENT_CACHE_TTL = 60000; // 1 minute

async function getLatestEnabledWhopGateway(env) {
  try {
    return await env.DB.prepare(`
      SELECT whop_product_id
      FROM payment_gateways
      WHERE gateway_type = 'whop' AND is_enabled = 1
      ORDER BY id DESC
      LIMIT 1
    `).first();
  } catch (e) {
    return null;
  }
}

/**
 * Get payment methods enabled status
 */
async function getPaymentMethodsEnabled(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('payment_methods').first();
    if (row?.value) {
      return JSON.parse(row.value);
    }
  } catch (e) {
    
  }
  // Default: both enabled
  return { paypal_enabled: true, whop_enabled: true };
}

/**
 * Get all enabled payment methods
 * OPTIMIZED: Added in-memory caching
 */
export async function getPaymentMethods(env) {
  const now = Date.now();
  
  // Return cached data if still valid
  if (paymentMethodsCache && (now - paymentMethodsCacheTime) < PAYMENT_CACHE_TTL) {
    return cachedJson({ methods: paymentMethodsCache }, 60);
  }
  
  const methods = [];
  
  // Get enabled status
  const enabledStatus = await getPaymentMethodsEnabled(env);
  
  // Check Whop - only if enabled
  if (enabledStatus.whop_enabled !== false) {
    try {
      const whopApiKey = await getWhopApiKey(env);
      if (whopApiKey) {
        methods.push({
          id: 'whop',
          name: 'All Payment Methods',
          icon: '\u{1F310}',
          description: 'GPay, Apple Pay, Cards, Bank & more',
          enabled: true,
          priority: 2
        });
      }
    } catch (e) {}
  }
  
  // Check PayPal - only if enabled
  if (enabledStatus.paypal_enabled !== false) {
    try {
      const paypalRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('paypal').first();
      if (paypalRow?.value) {
        const paypal = JSON.parse(paypalRow.value);
        const hasValidClientId = paypal.client_id && paypal.client_id.length > 10;
        const hasValidSecret = paypal.secret && paypal.secret.length > 10;
        
        if (paypal.enabled && hasValidClientId && hasValidSecret) {
          methods.push({
            id: 'paypal',
            name: 'PayPal',
            icon: '🅿️',
            description: 'Pay with PayPal',
            enabled: true,
            priority: 1,
            client_id: paypal.client_id,
            mode: paypal.mode || 'sandbox'
          });
        }
      } else if (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) {
        const hasValidClientId = env.PAYPAL_CLIENT_ID.length > 10;
        const hasValidSecret = env.PAYPAL_SECRET.length > 10;
        
        if (hasValidClientId && hasValidSecret) {
          methods.push({
            id: 'paypal',
            name: 'PayPal',
            icon: '🅿️',
            description: 'Pay with PayPal',
            enabled: true,
            priority: 1,
            client_id: env.PAYPAL_CLIENT_ID,
            mode: env.PAYPAL_MODE || 'sandbox'
          });
        }
      }
    } catch (e) {
      
    }
  }
  
  // Check Stripe (future)
  try {
    const stripeRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('stripe').first();
    if (stripeRow?.value) {
      const stripe = JSON.parse(stripeRow.value);
      if (stripe.enabled && stripe.publishable_key) {
        methods.push({
          id: 'stripe',
          name: 'Stripe',
          icon: '💳',
          description: 'Pay with Stripe',
          enabled: true,
          priority: 3,
          publishable_key: stripe.publishable_key
        });
      }
    }
  } catch (e) {}
  
  // Sort by priority
  methods.sort((a, b) => a.priority - b.priority);
  
  // Update cache
  paymentMethodsCache = methods;
  paymentMethodsCacheTime = Date.now();
  
  // Cache for 2 minutes on edge
  return cachedJson({ methods }, 120);
}

/**
 * Save payment methods enabled/disabled status
 */
export async function savePaymentMethodsEnabled(env, body) {
  const { paypal_enabled, whop_enabled } = body;
  
  // At least one must be enabled
  if (!paypal_enabled && !whop_enabled) {
    return json({ error: 'At least one payment method must be enabled' }, 400);
  }
  
  const settings = {
    paypal_enabled: !!paypal_enabled,
    whop_enabled: !!whop_enabled
  };
  
  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).bind('payment_methods', JSON.stringify(settings)).run();
  
  // Invalidate cache
  paymentMethodsCache = null;
  paymentMethodsCacheTime = 0;
  
  return json({ success: true, settings });
}

/**
 * Get payment methods enabled/disabled status
 */
export async function getPaymentMethodsStatus(env) {
  let status = { paypal_enabled: true, whop_enabled: true };
  
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('payment_methods').first();
    if (row?.value) {
      status = JSON.parse(row.value);
    }
  } catch (e) {}
  
  // Also check if methods are configured
  let paypalConfigured = false;
  let whopConfigured = false;
  
  try {
    const paypalRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('paypal').first();
    if (paypalRow?.value) {
      const paypal = JSON.parse(paypalRow.value);
      paypalConfigured = !!(paypal.enabled && paypal.client_id && paypal.secret);
    }
  } catch (e) {}
  
  try {
    const whopApiKey = await getWhopApiKey(env);
    whopConfigured = !!whopApiKey;
  } catch (e) {}
  
  // Cache for 2 minutes - payment settings don't change often
  return cachedJson({
    paypal_enabled: status.paypal_enabled !== false,
    whop_enabled: status.whop_enabled !== false,
    paypal_configured: paypalConfigured,
    whop_configured: whopConfigured
  }, 120);
}

/**
 * Get all payment settings for admin
 */
export async function getAllPaymentSettings(env) {
  const settings = {
    whop: { enabled: false },
    paypal: { enabled: false, client_id: '', mode: 'sandbox' },
    stripe: { enabled: false, publishable_key: '' }
  };
  
  try {
    // Whop
    const whopRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('whop').first();
    const whopGateway = await getLatestEnabledWhopGateway(env);
    const whopApiKey = await getWhopApiKey(env);
    if (whopRow?.value) {
      const whop = JSON.parse(whopRow.value);
      settings.whop = {
        enabled: !!whopApiKey,
        has_api_key: !!whopApiKey,
        default_product_id: whopGateway?.whop_product_id || whop.default_product_id || '',
        default_plan_id: whop.default_plan_id || ''
      };
    } else if (whopApiKey || whopGateway?.whop_product_id) {
      settings.whop = {
        enabled: !!whopApiKey,
        has_api_key: !!whopApiKey,
        default_product_id: whopGateway?.whop_product_id || '',
        default_plan_id: ''
      };
    }
    
    // PayPal
    const paypalRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('paypal').first();
    if (paypalRow?.value) {
      const paypal = JSON.parse(paypalRow.value);
      settings.paypal = {
        enabled: paypal.enabled || false,
        client_id: paypal.client_id || '',
        mode: paypal.mode || 'sandbox',
        has_secret: !!paypal.secret
      };
    }
    
    // Stripe
    const stripeRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('stripe').first();
    if (stripeRow?.value) {
      const stripe = JSON.parse(stripeRow.value);
      settings.stripe = {
        enabled: stripe.enabled || false,
        publishable_key: stripe.publishable_key || '',
        has_secret: !!stripe.secret_key
      };
    }
  } catch (e) {
    console.error('Failed to load payment settings:', e);
  }
  
  return json({ settings });
}

/**
 * Save payment method settings
 */
export async function savePaymentMethodSettings(env, body) {
  const { provider, settings } = body;
  
  if (!provider || !settings) {
    return json({ error: 'Provider and settings required' }, 400);
  }
  
  // Get existing settings to preserve secrets if not provided
  let existing = {};
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(provider).first();
    if (row?.value) {
      existing = JSON.parse(row.value);
    }
  } catch (e) {}
  
  // Merge settings (preserve secrets if not provided)
  const merged = { ...existing, ...settings };
  
  // For sensitive fields, keep existing if new value is empty
  if (provider === 'paypal' && !settings.secret && existing.secret) {
    merged.secret = existing.secret;
  }
  if (provider === 'stripe' && !settings.secret_key && existing.secret_key) {
    merged.secret_key = existing.secret_key;
  }
  if (provider === 'whop' && !settings.api_key && existing.api_key) {
    merged.api_key = existing.api_key;
  }
  
  await env.DB.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).bind(provider, JSON.stringify(merged)).run();

  paymentMethodsCache = null;
  paymentMethodsCacheTime = 0;
  
  return json({ success: true });
}
