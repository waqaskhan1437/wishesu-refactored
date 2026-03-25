/**
 * Email & Lead Management Controller
 *
 * Provides CRUD functions for email templates used for transactional and marketing
 * emails (order confirmations, delivery notifications, chat alerts, and general
 * marketing). Also exposes a lead capture API for storing user contact
 * information when they initiate checkout or submit a form but do not complete
 * an order. These functions are designed to be lightweight and only perform
 * work when triggered by an event, avoiding unnecessary background requests.
 */

import { json } from '../utils/response.js';
import { escapeHtml } from '../utils/formatting.js';
import { fetchWithTimeout } from '../utils/fetch-timeout.js';

// In‑memory caches for templates to avoid frequent DB queries
let templatesCache = null;
let templatesCacheTime = 0;
const TEMPLATES_CACHE_TTL = 60000; // 1 minute
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10000;

/**
 * Ensure the email_templates and leads tables exist. If they do not, create
 * them. This function is idempotent and can be called multiple times without
 * side effects. The email_templates table stores a unique template per type.
 * The leads table stores captured leads with a timestamp.
 *
 * @param {object} env Cloudflare environment with DB binding
 */
async function ensureEmailTables(env) {
  if (!env.DB) return;
  // Create email_templates table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT UNIQUE,
      subject TEXT,
      body TEXT,
      updated_at INTEGER
    )
  `).run();
  // Create leads table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      name TEXT,
      source TEXT,
      created_at INTEGER
    )
  `).run();
}

/**
 * Fetch all email templates from the database. Results are cached for a
 * short period to reduce DB overhead. You may optionally pass a type
 * parameter to return only a specific template.
 *
 * @param {object} env Cloudflare environment
 * @param {string} type Optional template type filter
 */
export async function getEmailTemplates(env, type = null) {
  const now = Date.now();
  if (templatesCache && (now - templatesCacheTime) < TEMPLATES_CACHE_TTL) {
    // Return cached copy if present
    if (type) {
      return templatesCache.filter(t => t.type === type);
    }
    return templatesCache;
  }
  await ensureEmailTables(env);
  try {
    const sql = type ? 'SELECT * FROM email_templates WHERE type = ?' : 'SELECT * FROM email_templates';
    const stmt = env.DB.prepare(sql);
    const rows = type ? (await stmt.bind(type).all()).results : (await stmt.all()).results;
    templatesCache = rows || [];
    templatesCacheTime = now;
    return templatesCache;
  } catch (e) {
    console.error('Email templates fetch error:', e);
    return [];
  }
}

/**
 * API wrapper for getEmailTemplates. Returns a JSON response suitable
 * for admin consumption. Pass ?type=xyz to filter.
 *
 * @param {object} env Cloudflare environment
 * @param {Request} req Incoming request
 */
export async function getEmailTemplatesApi(env, req) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const templates = await getEmailTemplates(env, type);
    return json({ success: true, templates });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * Insert or update an email template. If a template with the same type exists
 * it will be updated; otherwise a new row will be created. The updated_at
 * field is set to the current timestamp. Cache is invalidated after save.
 *
 * @param {object} env Cloudflare environment
 * @param {object} body JSON body containing type, subject, body
 */
export async function saveEmailTemplate(env, body) {
  try {
    await ensureEmailTables(env);
    const type = String(body.type || '').trim();
    const subject = String(body.subject || '').trim();
    const content = String(body.body || '').trim();
    if (!type) {
      return json({ error: 'Missing template type' }, 400);
    }
    // Upsert the template
    await env.DB.prepare(`
      INSERT INTO email_templates (type, subject, body, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(type) DO UPDATE SET
        subject = excluded.subject,
        body = excluded.body,
        updated_at = excluded.updated_at
    `).bind(type, subject, content, Date.now()).run();
    templatesCache = null;
    return json({ success: true });
  } catch (e) {
    console.error('Email template save error:', e);
    return json({ error: e.message }, 500);
  }
}

/**
 * API wrapper for saveEmailTemplate. Accepts JSON body from admin UI.
 *
 * @param {object} env Cloudflare environment
 * @param {object} body Request body parsed as JSON
 */
export async function saveEmailTemplateApi(env, body) {
  return saveEmailTemplate(env, body);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : '';
}

function resolveFromEmail(env) {
  return normalizeEmail(env.BREVO_FROM_EMAIL || env.FROM_EMAIL || 'support@prankwish.com');
}

function resolveFromName(env) {
  const name = String(env.BREVO_FROM_NAME || env.FROM_NAME || 'Prankwish').trim();
  return name || 'Prankwish';
}

function renderManualHtmlEmail(subject, message) {
  const safeSubject = escapeHtml(subject || '');
  const safeBody = escapeHtml(message || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
  return [
    '<div style="margin:0;background:#f8fafc;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;">',
    '  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">',
    '    <div style="background:#111827;padding:18px 22px;color:#ffffff;font-size:13px;letter-spacing:0.5px;">PRANKWISH MESSAGE</div>',
    '    <div style="padding:22px;">',
    `      <h2 style="margin:0 0 14px;color:#111827;font-size:20px;line-height:1.35;">${safeSubject}</h2>`,
    `      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;">${safeBody}</p>`,
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
}

async function sendBrevoEmail(env, payload) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY missing' };
  }

  const resp = await fetchWithTimeout(
    BREVO_API_URL,
    {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    },
    BREVO_TIMEOUT_MS
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Brevo send failed (${resp.status}): ${body || 'Unknown error'}`);
  }

  return resp.json().catch(() => ({}));
}

export async function sendCustomEmail(env, body) {
  try {
    const to = normalizeEmail(body.to || body.email || body.to_email);
    const subject = String(body.subject || '').trim().substring(0, 180);
    const message = String(body.message || body.body || '').trim().substring(0, 20000);

    if (!to) return json({ error: 'Valid recipient email is required' }, 400);
    if (!subject) return json({ error: 'Subject is required' }, 400);
    if (!message) return json({ error: 'Message is required' }, 400);

    const fromEmail = resolveFromEmail(env);
    if (!fromEmail) {
      return json({ error: 'Sender email is not configured (BREVO_FROM_EMAIL)' }, 500);
    }

    if (!String(env.BREVO_API_KEY || '').trim()) {
      return json({ error: 'Brevo is not configured (BREVO_API_KEY missing)' }, 500);
    }

    const fromName = resolveFromName(env);
    const htmlContent = renderManualHtmlEmail(subject, message);

    const brevoResponse = await sendBrevoEmail(env, {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent,
      textContent: message,
      tags: ['admin', 'manual-email']
    });

    return json({
      success: true,
      recipient: to,
      messageId: brevoResponse?.messageId || null
    });
  } catch (e) {
    console.error('Manual email send error:', e);
    return json({ error: e.message || 'Failed to send email' }, 500);
  }
}

export async function sendCustomEmailApi(env, body) {
  return sendCustomEmail(env, body);
}

/**
 * Insert a new lead (email capture) into the leads table. This is called
 * when a user enters their email in a form (e.g. checkout, contact) but
 * does not necessarily complete an order. No validation is performed
 * beyond simple trimming. Source can indicate where the lead originated.
 *
 * @param {object} env Cloudflare environment
 * @param {object} body Contains email, name (optional), and source (optional)
 */
export async function addLead(env, body) {
  try {
    await ensureEmailTables(env);
    const email = String(body.email || '').trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : '';
    const source = body.source ? String(body.source).trim() : '';
    if (!email || !email.includes('@')) {
      return json({ error: 'Invalid email' }, 400);
    }
    await env.DB.prepare(
      'INSERT INTO leads (email, name, source, created_at) VALUES (?, ?, ?, ?)'
    ).bind(email, name, source, Date.now()).run();
    return json({ success: true });
  } catch (e) {
    console.error('Lead insert error:', e);
    return json({ error: e.message }, 500);
  }
}

/**
 * API wrapper for addLead. Accepts JSON body containing email and optional
 * name/source fields.
 *
 * @param {object} env Cloudflare environment
 * @param {object} body JSON body
 */
export async function addLeadApi(env, body) {
  return addLead(env, body);
}
