/**
 * Order email notifier (Brevo)
 * Sends two transactional emails for each new order:
 * 1) Buyer confirmation email
 * 2) Admin notification email with full order + add-ons details
 */

import { escapeHtml } from './formatting.js';
import { fetchWithTimeout } from './fetch-timeout.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10000;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin.replace(/\/+$/, '');
  } catch (e) {
    return '';
  }
}

function resolveBaseUrl(env, orderData) {
  return normalizeBaseUrl(
    orderData.baseUrl ||
    env.PUBLIC_BASE_URL ||
    env.SITE_URL ||
    env.BASE_URL ||
    'https://prankwish.com'
  );
}

function resolveFromEmail(env) {
  return normalizeEmail(env.BREVO_FROM_EMAIL || env.FROM_EMAIL || 'support@prankwish.com');
}

function resolveFromName(env) {
  return String(env.BREVO_FROM_NAME || env.FROM_NAME || 'Prankwish').trim() || 'Prankwish';
}

function resolveAdminEmail(env, orderData) {
  return normalizeEmail(
    orderData.adminEmail ||
    env.ORDER_ADMIN_EMAIL ||
    env.ADMIN_NOTIFY_EMAIL ||
    env.BREVO_ADMIN_EMAIL ||
    env.ADMIN_EMAIL ||
    ''
  );
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(amount, currency = 'USD') {
  const safeAmount = asNumber(amount, 0);
  const safeCurrency = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency
    }).format(safeAmount);
  } catch (e) {
    return `$${safeAmount.toFixed(2)}`;
  }
}

function formatDeliveryTime(minutesValue) {
  const minutes = Math.max(0, Math.round(asNumber(minutesValue, 0)));
  if (!minutes) return 'Standard delivery';
  if (minutes <= 60) return 'Instant Delivery (60 minutes)';
  if (minutes < 1440) return `${Math.round(minutes / 60)} hour(s)`;
  const days = Math.max(1, Math.round(minutes / 1440));
  return `${days} day(s)`;
}

function formatTimestamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function splitUrlAndTrailingPunctuation(input) {
  let url = String(input || '').trim();
  let trailing = '';
  while (/[),.;!?]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function normalizeUrlList(value) {
  const text = String(value || '');
  const out = [];
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    const match = String(m[0] || '');
    if (!match) continue;
    const { url } = splitUrlAndTrailingPunctuation(match);
    if (url) out.push(url);
  }
  URL_RE.lastIndex = 0;
  return Array.from(new Set(out));
}

function isLikelyImageUrl(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(?:[\?#].*)?$/i.test(value)) return true;
  if (value.includes('res.cloudinary.com') && value.includes('/image/')) return true;
  return false;
}

function isLikelyDownloadableUrl(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
  if (isLikelyImageUrl(value)) return true;
  if (/(\/download\/|[?&]download=1)/i.test(value)) return true;
  return /\.(mp4|mov|webm|mkv|avi|m3u8|mp3|wav|pdf|zip|rar|7z|docx?|xlsx?|pptx?)(?:[\?#].*)?$/i.test(value);
}

function linkifyPlainText(text) {
  const source = String(text || '');
  if (!source) return '-';

  let out = '';
  let cursor = 0;
  let m;
  while ((m = URL_RE.exec(source)) !== null) {
    const raw = String(m[0] || '');
    const start = m.index;
    out += escapeHtml(source.slice(cursor, start));

    const { url, trailing } = splitUrlAndTrailingPunctuation(raw);
    if (url) {
      const safeUrl = escapeHtml(url);
      const extraAttrs = isLikelyDownloadableUrl(url) ? ' download' : '';
      out += `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer"${extraAttrs} style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${safeUrl}</a>`;
    } else {
      out += escapeHtml(raw);
    }

    if (trailing) out += escapeHtml(trailing);
    cursor = start + raw.length;
  }

  out += escapeHtml(source.slice(cursor));
  URL_RE.lastIndex = 0;
  return out;
}

function addonValueHtml(value) {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = normalized ? normalized.split('\n') : ['-'];
  const linkedLines = lines.map((line) => linkifyPlainText(line)).join('<br>');

  const imagePreviews = normalizeUrlList(normalized)
    .filter(isLikelyImageUrl)
    .slice(0, 3)
    .map((url) => {
      const safe = escapeHtml(url);
      return `
        <div style="margin-top:8px;">
          <a href="${safe}" target="_blank" rel="noopener noreferrer" download style="color:#1d4ed8;text-decoration:underline;font-size:12px;">Open image</a>
          <br>
          <img src="${safe}" alt="Uploaded media" style="margin-top:6px;max-width:220px;max-height:160px;border:1px solid #e2e8f0;border-radius:8px;display:block;">
        </div>
      `.trim();
    })
    .join('');

  if (!imagePreviews) return linkedLines;
  return `${linkedLines}<div style="margin-top:6px;">${imagePreviews}</div>`;
}

function normalizeAddons(addonsInput) {
  let source = addonsInput;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (e) {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source.map((item, index) => {
    if (item && typeof item === 'object') {
      const field = String(item.field || item.label || `Addon ${index + 1}`).trim() || `Addon ${index + 1}`;
      const value = String(item.value ?? item.selected ?? '').trim();
      return { field, value };
    }
    return {
      field: `Addon ${index + 1}`,
      value: String(item || '').trim()
    };
  });
}

function addonsTableHtml(addons) {
  if (!addons.length) {
    return '<p style="margin:0;color:#64748b;font-size:14px;">No add-ons selected.</p>';
  }

  const rows = addons.map((addon, idx) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;width:30%;">${escapeHtml(addon.field || `Addon ${idx + 1}`)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;line-height:1.5;">${addonValueHtml(addon.value || '-')}</td>
    </tr>
  `).join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
      <tbody>${rows}</tbody>
    </table>
  `;
}

function addonsText(addons) {
  if (!addons.length) return 'No add-ons selected';
  return addons.map((addon, idx) => `${idx + 1}. ${addon.field}: ${addon.value || '-'}`).join('\n');
}

function buildBuyerHtml(data) {
  return `
<div style="margin:0;background:#f1f5f9;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:24px 28px;color:#ffffff;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:0.6px;">PRANKWISH ORDER CONFIRMATION</div>
      <h2 style="margin:8px 0 0;font-size:24px;line-height:1.3;">Thank you for your order</h2>
      <p style="margin:10px 0 0;font-size:14px;opacity:0.95;">Order <strong>#${escapeHtml(data.orderId)}</strong> has been received successfully.</p>
    </div>

    <div style="padding:22px 24px;">
      <div style="display:block;border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#f8fafc;">
        <p style="margin:0 0 8px;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;">Product</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(data.productTitle)}</p>
        <p style="margin:10px 0 0;color:#334155;font-size:14px;">Amount: <strong>${escapeHtml(data.amountLabel)}</strong></p>
        <p style="margin:6px 0 0;color:#334155;font-size:14px;">Estimated delivery: <strong>${escapeHtml(data.deliveryLabel)}</strong></p>
      </div>

      <div style="margin-top:18px;">
        <h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">Your selected add-ons</h3>
        ${addonsTableHtml(data.addons)}
      </div>

      <div style="margin-top:20px;">
        <a href="${escapeHtml(data.buyerLink)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">Track Your Order</a>
      </div>

      <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.6;">
        Order placed on ${escapeHtml(data.createdAt)}. If you need help, reply to this email.
      </p>
    </div>
  </div>
</div>
`.trim();
}

function buildAdminHtml(data) {
  return `
<div style="margin:0;background:#f8fafc;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0b3b8f,#0ea5e9);padding:24px 28px;color:#ffffff;">
      <div style="font-size:13px;opacity:0.95;letter-spacing:0.6px;">NEW ORDER ALERT</div>
      <h2 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Order #${escapeHtml(data.orderId)}</h2>
      <p style="margin:10px 0 0;font-size:14px;opacity:0.95;">Customer: <strong>${escapeHtml(data.customerEmail || 'N/A')}</strong></p>
    </div>

    <div style="padding:22px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
        <tbody>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;width:30%;">Product</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.productTitle)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">Product ID</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.productIdLabel)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">Amount</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.amountLabel)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">Payment Method</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.paymentMethod)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">Delivery Target</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.deliveryLabel)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">Created At</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(data.createdAt)}</td></tr>
          <tr><td style="padding:10px 12px;font-weight:600;color:#0f172a;">Source</td><td style="padding:10px 12px;color:#334155;">${escapeHtml(data.orderSource)}</td></tr>
        </tbody>
      </table>

      <div style="margin-top:18px;">
        <h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">Customer add-ons / requirements</h3>
        ${addonsTableHtml(data.addons)}
      </div>

      <div style="margin-top:16px;padding:14px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;">
        <p style="margin:0 0 8px;font-size:13px;color:#1e3a8a;font-weight:700;">Raw add-ons JSON</p>
        <pre style="margin:0;font-size:12px;line-height:1.45;color:#1e293b;white-space:pre-wrap;word-break:break-word;">${escapeHtml(data.rawAddonsJson)}</pre>
      </div>

      <div style="margin-top:20px;">
        <a href="${escapeHtml(data.adminLink)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">Open Admin Order View</a>
      </div>
    </div>
  </div>
</div>
`.trim();
}

function buildBuyerText(data) {
  return [
    `Order confirmed: #${data.orderId}`,
    `Product: ${data.productTitle}`,
    `Amount: ${data.amountLabel}`,
    `Estimated delivery: ${data.deliveryLabel}`,
    `Track order: ${data.buyerLink}`,
    '',
    'Add-ons:',
    addonsText(data.addons)
  ].join('\n');
}

function buildAdminText(data) {
  return [
    `New order received: #${data.orderId}`,
    `Customer: ${data.customerEmail || 'N/A'}`,
    `Product: ${data.productTitle}`,
    `Product ID: ${data.productIdLabel}`,
    `Amount: ${data.amountLabel}`,
    `Payment Method: ${data.paymentMethod}`,
    `Delivery target: ${data.deliveryLabel}`,
    `Created at: ${data.createdAt}`,
    `Source: ${data.orderSource}`,
    `Admin order view: ${data.adminLink}`,
    '',
    'Add-ons:',
    addonsText(data.addons),
    '',
    'Raw add-ons JSON:',
    data.rawAddonsJson
  ].join('\n');
}

async function sendBrevoEmail(env, message) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY missing' };
  }

  const response = await fetchWithTimeout(
    BREVO_API_URL,
    {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(message)
    },
    BREVO_TIMEOUT_MS
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Brevo send failed (${response.status}): ${errBody || 'Unknown error'}`);
  }

  return response.json().catch(() => ({}));
}

async function enrichOrderData(env, orderData) {
  const productId = Number(orderData.productId || orderData.product_id || 0) || 0;
  let productTitle = String(orderData.productTitle || orderData.product_title || '').trim();

  if (!productTitle && productId && env.DB) {
    try {
      const row = await env.DB.prepare('SELECT title FROM products WHERE id = ?').bind(productId).first();
      if (row?.title) productTitle = String(row.title).trim();
    } catch (e) {
      // Ignore DB lookup failures for email enrichment
    }
  }

  if (!productTitle) productTitle = 'Custom Video Order';

  const addons = normalizeAddons(orderData.addons);
  const rawAddonsJson = (() => {
    try {
      return JSON.stringify(orderData.addons ?? [], null, 2);
    } catch (e) {
      return JSON.stringify(addons, null, 2);
    }
  })();

  const baseUrl = resolveBaseUrl(env, orderData);
  const orderId = String(orderData.orderId || orderData.order_id || '').trim();
  const customerEmail = normalizeEmail(orderData.customerEmail || orderData.customer_email || orderData.email);
  const currency = String(orderData.currency || 'USD').toUpperCase();
  const amountLabel = formatMoney(orderData.amount, currency);

  return {
    orderId,
    customerEmail,
    productId,
    productIdLabel: productId ? String(productId) : 'N/A',
    productTitle,
    addons,
    rawAddonsJson,
    amountLabel,
    deliveryLabel: formatDeliveryTime(orderData.deliveryTimeMinutes || orderData.delivery_minutes),
    paymentMethod: String(orderData.paymentMethod || orderData.payment_method || 'Online Checkout'),
    orderSource: String(orderData.orderSource || orderData.source || 'website'),
    createdAt: formatTimestamp(orderData.createdAt || orderData.created_at),
    buyerLink: `${baseUrl}/buyer-order.html?id=${encodeURIComponent(orderId)}`,
    adminLink: `${baseUrl}/order-detail.html?id=${encodeURIComponent(orderId)}&admin=1`
  };
}

export async function sendOrderNotificationEmails(env, orderData = {}) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY missing' };
  }

  const data = await enrichOrderData(env, orderData);
  if (!data.orderId) {
    return { skipped: true, reason: 'Missing orderId' };
  }

  const fromEmail = resolveFromEmail(env);
  const fromName = resolveFromName(env);
  const adminEmail = resolveAdminEmail(env, orderData);
  const buyerEmail = data.customerEmail;

  if (!fromEmail) {
    return { skipped: true, reason: 'Missing sender email' };
  }

  const tasks = [];

  if (buyerEmail) {
    tasks.push(sendBrevoEmail(env, {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: buyerEmail }],
      subject: `Order Confirmed #${data.orderId} - ${data.productTitle}`,
      htmlContent: buildBuyerHtml(data),
      textContent: buildBuyerText(data),
      tags: ['order', 'buyer', 'confirmation']
    }));
  }

  if (adminEmail) {
    tasks.push(sendBrevoEmail(env, {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: adminEmail }],
      subject: `New Order #${data.orderId} - ${data.productTitle}`,
      htmlContent: buildAdminHtml(data),
      textContent: buildAdminText(data),
      tags: ['order', 'admin', 'new-order']
    }));
  }

  if (!tasks.length) {
    return { skipped: true, reason: 'No buyer/admin email configured' };
  }

  const settled = await Promise.allSettled(tasks);
  const failures = settled.filter((x) => x.status === 'rejected');

  if (failures.length) {
    console.error('Order email(s) failed:', failures.map((f) => f.reason?.message || f.reason));
  }

  return {
    attempted: tasks.length,
    failed: failures.length,
    success: failures.length === 0
  };
}
