import { canonicalProductPath, escapeHtml, slugifyStr } from '../utils/formatting.js';
import { buildPublicProductStatusWhere } from '../utils/product-visibility.js';
import {
  updateOrder,
  deliverOrder,
  deleteOrder
} from './orders.js';
import { addReview, updateReview } from './reviews.js';
import {
  saveProduct,
  deleteProduct,
  updateProductStatus
} from './products.js';
import {
  savePage,
  updatePageStatus,
  deletePage
} from './pages.js';
import {
  saveBlog,
  updateBlogStatus,
  deleteBlog
} from './blog.js';
import { addBlogComment, updateCommentStatus } from './blog-comments.js';
import {
  submitQuestion,
  submitReply,
  updateQuestionStatus,
  updateReplyStatus
} from './forum.js';
import { getPaymentMethods } from './payment-gateway.js';
import { createPlanCheckout } from './whop.js';
import { createPayPalOrder, capturePayPalOrder } from './paypal.js';
import { calculateServerSidePrice } from '../utils/pricing.js';
import { calculateDeliveryMinutes } from '../utils/order-creation.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  const amount = toNumber(value, 0);
  return '$' + amount.toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return new Date(n).toLocaleString('en-US');
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US');
}

function extractBodyFragment(raw) {
  const input = String(raw || '');
  const bodyMatch = input.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1] || '';
  return input;
}

function sanitizeRichHtml(raw) {
  const input = String(raw || '');
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
}

function parseOrderEncryptedData(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function renderNotice(url) {
  const ok = url.searchParams.get('ok');
  const err = url.searchParams.get('err');
  if (!ok && !err) return '';
  if (err) {
    return `<div class="notice error">${escapeHtml(err)}</div>`;
  }
  return `<div class="notice ok">${escapeHtml(ok)}</div>`;
}

const NOJS_RESERVED_PUBLIC_SLUGS = new Set([
  '',
  'admin',
  'api',
  'blog',
  'buyer-order',
  'checkout',
  'download',
  'favicon.ico',
  'favicon.svg',
  'forum',
  'order',
  'order-detail',
  'order-success',
  'product',
  'products',
  'products-grid',
  'robots.txt',
  'sitemap.xml',
  'success'
]);

function renderLayout(opts = {}) {
  const title = escapeHtml(opts.title || 'WishVideo');
  const description = escapeHtml(opts.description || 'No-JS server-rendered experience');
  const nav = opts.admin
    ? `
      <nav class="nav">
        <a href="/admin">Dashboard</a>
        <a href="/admin/products">Products</a>
        <a href="/admin/orders">Orders</a>
        <a href="/admin/pages">Pages</a>
        <a href="/admin/blogs">Blogs</a>
        <a href="/admin/moderation">Moderation</a>
        <a href="/admin/logout">Logout</a>
      </nav>
    `
    : `
      <nav class="nav">
        <a href="/">Home</a>
        <a href="/blog">Blog</a>
        <a href="/forum">Forum</a>
      </nav>
    `;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${opts.head || ''}
  <style>
    :root {
      --bg: #f7f8fc;
      --card: #ffffff;
      --text: #111827;
      --muted: #4b5563;
      --line: #e5e7eb;
      --brand: #0f766e;
      --brand-soft: #ccfbf1;
      --err: #b91c1c;
      --ok: #065f46;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: var(--bg); color: var(--text); }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .top { background: linear-gradient(120deg, #eff6ff, #ecfeff); border-bottom: 1px solid var(--line); }
    .brand { font-weight: 800; letter-spacing: 0.2px; text-decoration: none; color: var(--text); font-size: 20px; }
    .nav { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
    .nav a { color: var(--brand); text-decoration: none; font-weight: 600; }
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
    .muted { color: var(--muted); }
    .btn {
      display: inline-block;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #0d9488;
      background: #0f766e;
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      cursor: pointer;
    }
    .btn.secondary {
      background: #fff;
      color: #0f766e;
    }
    .btn.danger {
      background: #b91c1c;
      border-color: #991b1b;
    }
    .form-grid { display: grid; gap: 10px; }
    label { font-size: 13px; font-weight: 700; color: #111827; }
    input, textarea, select {
      width: 100%;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #d1d5db;
      background: #fff;
      font: inherit;
    }
    textarea { min-height: 110px; resize: vertical; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 9px 6px; vertical-align: top; font-size: 14px; }
    .notice { padding: 12px; border-radius: 10px; margin: 14px 0; font-weight: 600; }
    .notice.ok { background: #ecfdf5; color: var(--ok); border: 1px solid #a7f3d0; }
    .notice.error { background: #fef2f2; color: var(--err); border: 1px solid #fecaca; }
    .pill {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      border-radius: 999px;
      padding: 4px 9px;
      background: var(--brand-soft);
      color: #115e59;
    }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .small { font-size: 12px; }
    img.thumb { width: 100%; max-height: 190px; object-fit: cover; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; }
    @media (max-width: 700px) {
      .wrap { padding: 14px; }
      th, td { font-size: 13px; }
    }
  </style>
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="${opts.admin ? '/admin' : '/'}">WishVideo No-JS</a>
      ${nav}
    </div>
  </header>
  <main class="wrap">
    ${opts.content || ''}
  </main>
</body>
</html>`;
}

function htmlResponse(html, opts = {}) {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8'
  });
  if (opts.admin) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
  } else {
    headers.set('Cache-Control', 'no-store');
  }
  if (opts.headers && typeof opts.headers === 'object') {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v !== undefined && v !== null) headers.set(k, String(v));
    }
  }
  return new Response(html, { status: opts.status || 200, headers });
}

function redirectWithParams(url, path, params = {}, status = 303) {
  const to = new URL(path, url.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      to.searchParams.set(k, String(v));
    }
  }
  return Response.redirect(to.toString(), status);
}

async function readForm(req) {
  const fd = await req.formData();
  const out = {};
  for (const [k, v] of fd.entries()) {
    out[k] = typeof v === 'string' ? v.trim() : String(v);
  }
  return out;
}

async function readJsonResponse(resp) {
  let data = {};
  try {
    data = await resp.clone().json();
  } catch (_) {
    data = {};
  }
  return { ok: resp.ok, status: resp.status, data };
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return '';
  const parts = String(cookieHeader).split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return rest.join('=') || '';
  }
  return '';
}

function toBase64Url(input) {
  const b64 = btoa(String(input || ''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return atob(padded);
}

function buildCheckoutHintCookie(url, hint) {
  const payload = toBase64Url(JSON.stringify(hint || {}));
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `nojs_checkout_hint=${payload}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
}

function clearCheckoutHintCookie(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `nojs_checkout_hint=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readCheckoutHintFromRequest(req) {
  try {
    const cookieHeader = req?.headers?.get('Cookie') || '';
    const raw = getCookieValue(cookieHeader, 'nojs_checkout_hint');
    if (!raw) return null;
    const json = fromBase64Url(raw);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function resolveProductPath(env, productId) {
  const row = await env.DB.prepare(
    'SELECT id, title, slug FROM products WHERE id = ?'
  ).bind(Number(productId)).first();
  if (!row) return '/';
  return canonicalProductPath(row);
}

async function getPublishedPageBySlug(env, slug) {
  if (!env?.DB || !slug) return null;
  return env.DB.prepare(`
    SELECT id, slug, title, meta_description, content, page_type, is_default
    FROM pages
    WHERE slug = ? AND status = 'published'
    LIMIT 1
  `).bind(String(slug)).first();
}

async function getDefaultPublishedPage(env, pageType) {
  if (!env?.DB || !pageType) return null;
  return env.DB.prepare(`
    SELECT id, slug, title, meta_description, content, page_type, is_default
    FROM pages
    WHERE page_type = ? AND is_default = 1 AND status = 'published'
    ORDER BY id DESC
    LIMIT 1
  `).bind(String(pageType)).first();
}

function renderStoreProductCards(products = []) {
  return products.map((p) => {
    const productUrl = canonicalProductPath(p);
    const price = p.sale_price && Number(p.sale_price) > 0
      ? `<div><strong>${formatMoney(p.sale_price)}</strong> <span class="muted"><s>${formatMoney(p.normal_price)}</s></span></div>`
      : `<div><strong>${formatMoney(p.normal_price)}</strong></div>`;
    const thumb = p.thumbnail_url
      ? `<img class="thumb" src="${escapeHtml(p.thumbnail_url)}" alt="${escapeHtml(p.title || 'Product')}" loading="lazy">`
      : `<div class="card muted">No image</div>`;
    return `
      <article class="card">
        ${thumb}
        <h3>${escapeHtml(p.title || 'Untitled')}</h3>
        <p class="muted">${escapeHtml((p.description || '').slice(0, 220))}</p>
        ${price}
        <p class="small muted">Delivery: ${p.instant_delivery ? 'Instant' : (escapeHtml(p.normal_delivery_text || '1') + ' day(s)')}</p>
        <a class="btn" href="${productUrl}">Open Product</a>
      </article>
    `;
  }).join('');
}

async function renderStorefront(env, url, opts = {}) {
  const pageType = opts.pageType || '';
  const page = pageType ? await getDefaultPublishedPage(env, pageType) : null;
  const productsResult = await env.DB.prepare(`
    SELECT id, title, slug, description, normal_price, sale_price, thumbnail_url, normal_delivery_text, instant_delivery
    FROM products
    WHERE ${buildPublicProductStatusWhere('status')}
    ORDER BY sort_order ASC, id DESC
    LIMIT 120
  `).all();
  const products = productsResult.results || [];
  const introHtml = page?.content
    ? `<section class="card">${sanitizeRichHtml(extractBodyFragment(page.content))}</section>`
    : '';
  const content = `
    <h1>${escapeHtml(page?.title || opts.heading || 'Server-rendered Storefront')}</h1>
    ${renderNotice(url)}
    <p class="muted">${escapeHtml(opts.introText || 'This storefront is rendered fully on server with plain HTML forms and no client JS.')}</p>
    ${introHtml}
    <section class="grid grid-3">${renderStoreProductCards(products) || '<div class="card">No products available.</div>'}</section>
  `;

  return htmlResponse(renderLayout({
    title: page?.title || opts.title || 'WishVideo Store',
    description: page?.meta_description || opts.description || 'Server-rendered storefront',
    content
  }));
}

async function renderCustomPage(env, url, slug) {
  const page = await getPublishedPageBySlug(env, slug);
  if (!page) return null;
  const bodyHtml = sanitizeRichHtml(extractBodyFragment(page.content || ''));
  return htmlResponse(renderLayout({
    title: page.title || slug,
    description: page.meta_description || `${page.title || slug} - server-rendered page`,
    content: `
      ${renderNotice(url)}
      ${bodyHtml || `<section class="card"><h1>${escapeHtml(page.title || slug)}</h1></section>`}
    `
  }));
}

async function getNoJsPaymentMethods(env) {
  try {
    const response = await getPaymentMethods(env);
    const parsed = await readJsonResponse(response);
    const methods = Array.isArray(parsed.data?.methods) ? parsed.data.methods : [];
    const filtered = methods
      .map((m) => ({ id: String(m.id || '').toLowerCase(), name: String(m.name || '').trim() }))
      .filter((m) => m.id === 'whop' || m.id === 'paypal');
    if (filtered.length > 0) return filtered;
  } catch (_) {}
  return [{ id: 'whop', name: 'Whop' }];
}

function normalizePaymentMethod(raw, fallback = 'whop') {
  const m = String(raw || '').trim().toLowerCase();
  if (!m) return fallback;
  if (m === 'paypal') return 'paypal';
  return 'whop';
}

async function createGatewayCheckoutRedirect(env, url, opts = {}) {
  const method = normalizePaymentMethod(opts.method);
  const productId = Number(opts.productId);
  const email = String(opts.email || '').trim();
  const addons = Array.isArray(opts.addons) ? opts.addons : [];
  const couponCode = String(opts.couponCode || '').trim();

  const product = await env.DB.prepare(
    'SELECT id, title, instant_delivery, normal_delivery_text, status FROM products WHERE id = ? LIMIT 1'
  ).bind(productId).first();
  if (!product || product.status !== 'active') {
    return { ok: false, error: 'Product not found or inactive.' };
  }

  const deliveryTimeMinutes = Number(calculateDeliveryMinutes(product)) || 60;

  if (method === 'paypal') {
    let amount = 0;
    try {
      amount = await calculateServerSidePrice(env, productId, addons, couponCode || null);
    } catch (e) {
      return { ok: false, error: 'Could not calculate server-side price for PayPal.' };
    }

    const ppResp = await createPayPalOrder(env, {
      product_id: productId,
      amount,
      email,
      deliveryTimeMinutes,
      metadata: {
        addons,
        deliveryTimeMinutes,
        product_id: String(productId),
        product_title: product.title || '',
        couponCode: couponCode || null,
        source: 'nojs-ssr'
      }
    }, url.origin);

    const parsed = await readJsonResponse(ppResp);
    const checkoutUrl = parsed.data?.checkout_url || '';
    if (!parsed.ok || !parsed.data?.success || !checkoutUrl) {
      return { ok: false, error: parsed.data?.error || 'Failed to initialize PayPal checkout.' };
    }
    return { ok: true, checkoutUrl, provider: 'paypal', checkoutId: parsed.data?.order_id || '' };
  }

  const whopResp = await createPlanCheckout(env, {
    product_id: productId,
    email,
    couponCode: couponCode || undefined,
    metadata: {
      addons,
      deliveryTimeMinutes,
      product_id: String(productId),
      product_title: product.title || '',
      source: 'nojs-ssr'
    }
  }, url.origin);
  const parsed = await readJsonResponse(whopResp);
  const checkoutUrl = parsed.data?.checkout_url || '';
  if (!parsed.ok || !parsed.data?.success || !checkoutUrl) {
    return { ok: false, error: parsed.data?.error || 'Failed to initialize checkout.' };
  }
  return { ok: true, checkoutUrl, provider: 'whop', checkoutId: parsed.data?.checkout_id || '' };
}

async function renderHome(env, url) {
  return renderStorefront(env, url, {
    pageType: 'home',
    title: 'WishVideo Store',
    description: 'Server-rendered home page',
    heading: 'Server-rendered Storefront',
    introText: 'This storefront is rendered fully on server with plain HTML forms and no client JS.'
  });
}

async function renderProductsArchive(env, url) {
  return renderStorefront(env, url, {
    pageType: 'product_grid',
    title: 'All Products',
    description: 'Server-rendered product archive',
    heading: 'All Products',
    introText: 'Every product card on this page is rendered server-side.'
  });
}

function parseAddonDefinitions(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const label = String(item.label || item.name || item.title || item.field || ('Addon ' + (idx + 1))).trim();
        const type = String(item.type || 'text').toLowerCase();
        const required = item.required === true || item.required === 1 || item.required === '1';
        return { label, type, required };
      })
      .filter(Boolean)
      .slice(0, 30);
  } catch (_) {
    return [];
  }
}

async function renderProduct(env, url, productId) {
  const product = await env.DB.prepare(`
    SELECT *
    FROM products
    WHERE id = ? AND ${buildPublicProductStatusWhere('status')}
    LIMIT 1
  `).bind(Number(productId)).first();

  if (!product) {
    return htmlResponse(renderLayout({
      title: 'Product Not Found',
      content: '<h1>Product not found</h1><p><a class="btn secondary" href="/">Back to home</a></p>'
    }), { status: 404 });
  }

  const reviewRows = await env.DB.prepare(`
    SELECT author_name, rating, comment, created_at
    FROM reviews
    WHERE product_id = ? AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 15
  `).bind(Number(productId)).all();
  const reviews = reviewRows.results || [];
  const addons = parseAddonDefinitions(product.addons_json);
  const paymentMethods = await getNoJsPaymentMethods(env);
  const paymentOptionsHtml = paymentMethods.map((m) => {
    const label = m.id === 'paypal' ? 'PayPal' : (m.name || 'Whop');
    return `<option value="${escapeHtml(m.id)}">${escapeHtml(label)}</option>`;
  }).join('');
  const safeSlugPath = canonicalProductPath(product);
  const priceBlock = product.sale_price && Number(product.sale_price) > 0
    ? `<div class="row"><span class="pill">Sale</span> <strong>${formatMoney(product.sale_price)}</strong> <span class="muted"><s>${formatMoney(product.normal_price)}</s></span></div>`
    : `<div><strong>${formatMoney(product.normal_price)}</strong></div>`;

  const addonFields = addons.map((addon, idx) => {
    const key = String(idx);
    const fieldLabel = escapeHtml(addon.label);
    const required = addon.required ? 'required' : '';
    if (addon.type === 'textarea') {
      return `
        <div>
          <label>${fieldLabel}</label>
          <input type="hidden" name="addon_label_${key}" value="${fieldLabel}">
          <textarea name="addon_value_${key}" ${required}></textarea>
        </div>
      `;
    }
    return `
      <div>
        <label>${fieldLabel}</label>
        <input type="hidden" name="addon_label_${key}" value="${fieldLabel}">
        <input type="text" name="addon_value_${key}" ${required}>
      </div>
    `;
  }).join('');

  const reviewHtml = reviews.map((r) => `
    <article class="card">
      <div class="row">
        <strong>${escapeHtml(r.author_name || 'Customer')}</strong>
        <span class="pill">${escapeHtml(r.rating || 5)}/5</span>
        <span class="small muted">${escapeHtml(formatDate(r.created_at))}</span>
      </div>
      <p>${escapeHtml(r.comment || '')}</p>
    </article>
  `).join('');

  const content = `
    <h1>${escapeHtml(product.title || 'Product')}</h1>
    ${renderNotice(url)}
    <div class="grid grid-2">
      <section class="card">
        ${product.thumbnail_url ? `<img class="thumb" src="${escapeHtml(product.thumbnail_url)}" alt="${escapeHtml(product.title || 'Product image')}">` : ''}
        <p class="muted">${escapeHtml(product.description || '')}</p>
        ${priceBlock}
        <p class="small muted">Delivery: ${product.instant_delivery ? 'Instant' : (escapeHtml(product.normal_delivery_text || '1') + ' day(s)')}</p>
      </section>
      <section class="card">
        <h2>Order Form</h2>
        <p class="small muted">This is a pure HTML form flow (no JS checkout).</p>
        <form class="form-grid" method="post" action="/order/create">
          <input type="hidden" name="product_id" value="${escapeHtml(product.id)}">
          <input type="hidden" name="return_to" value="${escapeHtml(safeSlugPath)}">
          <div>
            <label>Your Email</label>
            <input type="email" name="email" required>
          </div>
          ${addonFields}
          <div>
            <label>Coupon Code (optional)</label>
            <input type="text" name="coupon_code">
          </div>
          <div>
            <label>Payment Method</label>
            <select name="payment_method">
              ${paymentOptionsHtml}
            </select>
          </div>
          <button class="btn" type="submit">Place Order</button>
        </form>
      </section>
    </div>
    <section style="margin-top:20px;">
      <h2>Recent Reviews</h2>
      <div class="grid">${reviewHtml || '<div class="card muted">No reviews yet.</div>'}</div>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: product.title || 'Product',
    description: (product.description || '').slice(0, 150),
    content
  }));
}

async function handleCreateOrder(env, req, url) {
  const form = await readForm(req);
  const productId = toNumber(form.product_id);
  if (!productId) {
    return redirectWithParams(url, '/', { err: 'Invalid product id.' });
  }
  const backTo = form.return_to || await resolveProductPath(env, productId);
  const email = String(form.email || '').trim();
  if (!email) {
    return redirectWithParams(url, backTo, { err: 'Email is required.' });
  }
  const paymentMethod = normalizePaymentMethod(form.payment_method, 'whop');

  const addons = [];
  for (const [k, v] of Object.entries(form)) {
    if (!k.startsWith('addon_value_')) continue;
    const idx = k.split('addon_value_')[1];
    const value = String(v || '').trim();
    if (!value) continue;
    const label = String(form['addon_label_' + idx] || ('Addon ' + idx)).trim();
    addons.push({ field: label, value });
  }

  const checkout = await createGatewayCheckoutRedirect(env, url, {
    method: paymentMethod,
    productId,
    email,
    addons,
    couponCode: String(form.coupon_code || '').trim()
  });
  if (!checkout.ok || !checkout.checkoutUrl) {
    return redirectWithParams(url, backTo, { err: checkout.error || 'Failed to start checkout.' });
  }
  const hint = {
    provider: checkout.provider || paymentMethod,
    checkout_id: checkout.checkoutId || '',
    product_id: productId,
    created_at: Date.now()
  };
  return new Response(null, {
    status: 302,
    headers: {
      'Location': checkout.checkoutUrl,
      'Set-Cookie': buildCheckoutHintCookie(url, hint),
      'Cache-Control': 'no-store'
    }
  });
}

async function lookupOrderDetailsByOrderId(env, orderId) {
  if (!orderId) return null;
  return env.DB.prepare(`
    SELECT o.order_id, o.status, o.created_at, o.delivery_time_minutes, p.title as product_title
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    WHERE o.order_id = ?
    LIMIT 1
  `).bind(orderId).first();
}

async function lookupOrderByWhopCheckoutId(env, checkoutId) {
  if (!checkoutId) return null;
  const row = await env.DB.prepare(`
    SELECT o.order_id
    FROM orders o
    WHERE o.encrypted_data LIKE ?
    ORDER BY o.id DESC
    LIMIT 1
  `).bind(`%"whop_checkout_id":"${checkoutId}"%`).first();
  if (!row?.order_id) return null;
  return lookupOrderDetailsByOrderId(env, String(row.order_id));
}

async function renderSuccess(env, url, req) {
  const queryProvider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
  const paypalToken = String(url.searchParams.get('token') || url.searchParams.get('order_id') || '').trim();
  let orderId = String(url.searchParams.get('order_id') || '').trim();
  let extraNotice = '';
  let extraNoticeType = 'ok';
  const hint = readCheckoutHintFromRequest(req);
  const provider = queryProvider || String(hint?.provider || '').trim().toLowerCase();
  const productParam = String(url.searchParams.get('product') || hint?.product_id || '').trim();
  let order = null;
  let pendingAutoRefresh = false;
  let refreshTarget = '';
  const attempt = Math.max(0, toNumber(url.searchParams.get('attempt'), 0));
  const maxAttempts = 25;

  if (provider === 'paypal' && paypalToken) {
    const captureResp = await capturePayPalOrder(env, { order_id: paypalToken });
    const capture = await readJsonResponse(captureResp);
    if (capture.ok && capture.data?.success && capture.data?.order_id) {
      orderId = String(capture.data.order_id);
      extraNotice = 'PayPal payment captured successfully.';
    } else {
      // Graceful fallback: if already captured, try resolving local order.
      const msg = String(capture.data?.error || '').toLowerCase();
      if (msg.includes('already') && msg.includes('capture')) {
        const existing = await env.DB.prepare(
          "SELECT order_id FROM orders WHERE encrypted_data LIKE ? ORDER BY id DESC LIMIT 1"
        ).bind(`%"paypalOrderId":"${paypalToken}"%`).first();
        if (existing?.order_id) {
          orderId = String(existing.order_id);
          extraNotice = 'Payment already captured earlier.';
        }
      }
      if (!orderId && !extraNotice) {
        extraNotice = capture.data?.error || 'Payment is being processed. Please check your order shortly.';
        extraNoticeType = 'error';
      }
    }
  }

  if (orderId) {
    order = await lookupOrderDetailsByOrderId(env, orderId);
  }

  // Whop webhook flow: order may take a short while to appear after redirect.
  if (!order && provider === 'whop' && hint?.checkout_id) {
    order = await lookupOrderByWhopCheckoutId(env, String(hint.checkout_id));
    if (order) {
      orderId = String(order.order_id);
      extraNotice = 'Whop payment confirmed and order finalized.';
    } else {
      const session = await env.DB.prepare(
        'SELECT status, created_at, completed_at FROM checkout_sessions WHERE checkout_id = ? LIMIT 1'
      ).bind(String(hint.checkout_id)).first();

      if (session?.status === 'completed') {
        extraNotice = 'Payment confirmed. Finalizing order record. Please wait a few seconds.';
      } else if (session?.status === 'pending') {
        extraNotice = 'Payment verification in progress. Waiting for gateway confirmation webhook.';
      } else {
        extraNotice = 'Checkout session found. Waiting for final order sync.';
      }

      if (attempt < maxAttempts) {
        pendingAutoRefresh = true;
        const refreshUrl = new URL('/success', url.origin);
        if (productParam) refreshUrl.searchParams.set('product', productParam);
        if (provider) refreshUrl.searchParams.set('provider', provider);
        refreshUrl.searchParams.set('attempt', String(attempt + 1));
        refreshTarget = refreshUrl.pathname + refreshUrl.search;
      } else {
        extraNoticeType = 'error';
        extraNotice = 'Order is still pending. Please wait 1-2 minutes and refresh manually.';
      }
    }
  }

  const statusCard = order
    ? `
      <p><strong>Order ID:</strong> ${escapeHtml(order.order_id)}</p>
      <p><strong>Status:</strong> ${escapeHtml(order.status || 'PAID')}</p>
      <p><strong>Product:</strong> ${escapeHtml(order.product_title || '-')}</p>
      <p><strong>Created:</strong> ${escapeHtml(formatDate(order.created_at))}</p>
      <p><strong>Delivery Window:</strong> ${escapeHtml(order.delivery_time_minutes || 60)} minutes</p>
      <p><a class="btn" href="/order/${encodeURIComponent(order.order_id)}">Open Order Page</a></p>
    `
    : `
      <p>Your payment was received. Order finalization is running server-side.</p>
      ${hint?.checkout_id ? `<p><strong>Checkout Ref:</strong> ${escapeHtml(String(hint.checkout_id))}</p>` : ''}
      ${pendingAutoRefresh
        ? `<p class="muted">Auto-check attempt ${escapeHtml(attempt + 1)} of ${escapeHtml(maxAttempts)}. Refreshing shortly...</p>`
        : '<p class="muted">Please refresh this page in a few moments.</p>'
      }
      ${refreshTarget ? `<p><a class="btn" href="${escapeHtml(refreshTarget)}">Check Order Now</a></p>` : ''}
    `;

  const head = pendingAutoRefresh && refreshTarget
    ? `<meta http-equiv="refresh" content="8;url=${escapeHtml(refreshTarget)}">`
    : '';

  const responseHeaders = {};
  if (order) {
    responseHeaders['Set-Cookie'] = clearCheckoutHintCookie(url);
  }

  const content = `
    <h1>Order Success</h1>
    ${renderNotice(url)}
    ${extraNotice ? `<div class="notice ${extraNoticeType === 'error' ? 'error' : 'ok'}">${escapeHtml(extraNotice)}</div>` : ''}
    <div class="card">
      ${statusCard}
      <p><a class="btn secondary" href="/">Back to Home</a></p>
    </div>
  `;
  return htmlResponse(renderLayout({
    title: 'Order Success',
    head,
    content
  }), {
    headers: responseHeaders
  });
}

async function renderOrder(env, url, orderId) {
  const row = await env.DB.prepare(`
    SELECT o.*, p.title as product_title
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    WHERE o.order_id = ?
    LIMIT 1
  `).bind(orderId).first();

  if (!row) {
    return htmlResponse(renderLayout({
      title: 'Order Not Found',
      content: '<h1>Order not found</h1><p><a class="btn secondary" href="/">Home</a></p>'
    }), { status: 404 });
  }

  const orderData = parseOrderEncryptedData(row.encrypted_data || '{}');
  const reviewExists = await env.DB.prepare(
    'SELECT id FROM reviews WHERE order_id = ? LIMIT 1'
  ).bind(orderId).first();

  const addonItems = Array.isArray(orderData.addons) ? orderData.addons : [];
  const addonHtml = addonItems.length
    ? addonItems.map((a) => `<li><strong>${escapeHtml(a.field || 'Field')}:</strong> ${escapeHtml(a.value || '')}</li>`).join('')
    : '<li>No addons</li>';

  const content = `
    <h1>Order ${escapeHtml(orderId)}</h1>
    ${renderNotice(url)}
    <div class="grid grid-2">
      <section class="card">
        <p><strong>Product:</strong> ${escapeHtml(row.product_title || '-')}</p>
        <p><strong>Status:</strong> <span class="pill">${escapeHtml(row.status || 'pending')}</span></p>
        <p><strong>Email:</strong> ${escapeHtml(orderData.email || '-')}</p>
        <p><strong>Amount:</strong> ${formatMoney(orderData.amount || 0)}</p>
        <p><strong>Created:</strong> ${escapeHtml(formatDate(row.created_at))}</p>
        <p><strong>Delivered Video:</strong> ${row.delivered_video_url ? `<a href="${escapeHtml(row.delivered_video_url)}" target="_blank" rel="noopener">Open</a>` : 'Not delivered yet'}</p>
      </section>
      <section class="card">
        <h2>Addon Details</h2>
        <ul>${addonHtml}</ul>
      </section>
    </div>
    <section class="card" style="margin-top:18px;">
      <h2>Submit Review</h2>
      ${reviewExists ? '<p class="muted">Review already submitted for this order.</p>' : `
        <form class="form-grid" method="post" action="/order/${encodeURIComponent(orderId)}/review">
          <div>
            <label>Name</label>
            <input type="text" name="author" required>
          </div>
          <div>
            <label>Rating (1-5)</label>
            <select name="rating">
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </div>
          <div>
            <label>Comment</label>
            <textarea name="comment"></textarea>
          </div>
          <button class="btn" type="submit">Submit Review</button>
        </form>
      `}
    </section>
  `;
  return htmlResponse(renderLayout({
    title: `Order ${orderId}`,
    content
  }));
}

async function handleOrderReview(env, req, url, orderId) {
  const order = await env.DB.prepare(
    'SELECT product_id FROM orders WHERE order_id = ? LIMIT 1'
  ).bind(orderId).first();
  if (!order) {
    return redirectWithParams(url, '/', { err: 'Order not found.' });
  }
  const form = await readForm(req);
  const resp = await addReview(env, {
    productId: Number(order.product_id),
    orderId,
    author: form.author || 'Customer',
    rating: toNumber(form.rating, 5),
    comment: form.comment || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, `/order/${encodeURIComponent(orderId)}`, {
      err: parsed.data.error || 'Failed to submit review.'
    });
  }
  return redirectWithParams(url, `/order/${encodeURIComponent(orderId)}`, {
    ok: 'Review submitted.'
  });
}

async function renderBlogList(env, url) {
  const r = await env.DB.prepare(`
    SELECT id, title, slug, description, thumbnail_url, created_at
    FROM blogs
    WHERE status = 'published'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();
  const blogs = r.results || [];
  const items = blogs.map((b) => `
    <article class="card">
      ${b.thumbnail_url ? `<img class="thumb" src="${escapeHtml(b.thumbnail_url)}" alt="${escapeHtml(b.title || 'Blog image')}">` : ''}
      <h3><a href="/blog/${encodeURIComponent(b.slug || '')}">${escapeHtml(b.title || 'Untitled')}</a></h3>
      <p class="muted">${escapeHtml((b.description || '').slice(0, 220))}</p>
      <p class="small muted">${escapeHtml(formatDate(b.created_at))}</p>
    </article>
  `).join('');

  return htmlResponse(renderLayout({
    title: 'Blog',
    content: `
      <h1>Blog Archive</h1>
      ${renderNotice(url)}
      <section class="grid grid-3">${items || '<div class="card">No posts yet.</div>'}</section>
    `
  }));
}

async function renderBlogPost(env, url, slug) {
  const blog = await env.DB.prepare(`
    SELECT *
    FROM blogs
    WHERE slug = ? AND status = 'published'
    LIMIT 1
  `).bind(slug).first();

  if (!blog) {
    return htmlResponse(renderLayout({
      title: 'Blog Not Found',
      content: '<h1>Blog post not found</h1><p><a class="btn secondary" href="/blog">Back to blog</a></p>'
    }), { status: 404 });
  }

  const commentsResult = await env.DB.prepare(`
    SELECT id, name, comment, created_at
    FROM blog_comments
    WHERE blog_id = ? AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 80
  `).bind(Number(blog.id)).all();
  const comments = commentsResult.results || [];
  const commentsHtml = comments.map((c) => `
    <article class="card">
      <p><strong>${escapeHtml(c.name || 'User')}</strong> <span class="small muted">${escapeHtml(formatDate(c.created_at))}</span></p>
      <p>${escapeHtml(c.comment || '')}</p>
    </article>
  `).join('');

  const content = `
    <h1>${escapeHtml(blog.title || 'Blog Post')}</h1>
    ${renderNotice(url)}
    <p class="muted">${escapeHtml(blog.description || '')}</p>
    <article class="card">${sanitizeRichHtml(blog.content || '<p>No content.</p>')}</article>
    <section style="margin-top:18px;" class="card">
      <h2>Leave a Comment</h2>
      <form class="form-grid" method="post" action="/blog/${encodeURIComponent(slug)}/comment">
        <div>
          <label>Name</label>
          <input type="text" name="name" required>
        </div>
        <div>
          <label>Email</label>
          <input type="email" name="email" required>
        </div>
        <div>
          <label>Comment</label>
          <textarea name="comment" required></textarea>
        </div>
        <button class="btn" type="submit">Submit Comment</button>
      </form>
      <p class="small muted">Comments are moderated server-side.</p>
    </section>
    <section style="margin-top:18px;">
      <h2>Comments</h2>
      <div class="grid">${commentsHtml || '<div class="card muted">No approved comments yet.</div>'}</div>
    </section>
  `;

  return htmlResponse(renderLayout({
    title: blog.title || 'Blog',
    content
  }));
}

async function handleBlogComment(env, req, url, slug) {
  const blog = await env.DB.prepare(
    'SELECT id FROM blogs WHERE slug = ? AND status = ? LIMIT 1'
  ).bind(slug, 'published').first();
  if (!blog) {
    return redirectWithParams(url, '/blog', { err: 'Blog post not found.' });
  }
  const form = await readForm(req);
  const resp = await addBlogComment(env, {
    blog_id: Number(blog.id),
    name: form.name || '',
    email: form.email || '',
    comment: form.comment || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, `/blog/${encodeURIComponent(slug)}`, {
      err: parsed.data.error || 'Failed to submit comment.'
    });
  }
  return redirectWithParams(url, `/blog/${encodeURIComponent(slug)}`, {
    ok: parsed.data.message || 'Comment submitted for moderation.'
  });
}

async function renderForumList(env, url) {
  const result = await env.DB.prepare(`
    SELECT id, title, slug, content, name, reply_count, created_at
    FROM forum_questions
    WHERE status = 'approved'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();
  const questions = result.results || [];
  const rows = questions.map((q) => `
    <article class="card">
      <h3><a href="/forum/${encodeURIComponent(q.slug || '')}">${escapeHtml(q.title || 'Untitled')}</a></h3>
      <p class="muted">${escapeHtml((q.content || '').slice(0, 240))}</p>
      <p class="small muted">By ${escapeHtml(q.name || 'User')} - ${escapeHtml(formatDate(q.created_at))} - Replies: ${escapeHtml(q.reply_count || 0)}</p>
    </article>
  `).join('');

  const content = `
    <h1>Forum</h1>
    ${renderNotice(url)}
    <section class="card">
      <h2>Ask a Question</h2>
      <form class="form-grid" method="post" action="/forum/ask">
        <div>
          <label>Name</label>
          <input type="text" name="name" required>
        </div>
        <div>
          <label>Email</label>
          <input type="email" name="email" required>
        </div>
        <div>
          <label>Title</label>
          <input type="text" name="title" required>
        </div>
        <div>
          <label>Question</label>
          <textarea name="content" required></textarea>
        </div>
        <button class="btn" type="submit">Submit Question</button>
      </form>
      <p class="small muted">Questions are moderated before they become public.</p>
    </section>
    <section style="margin-top:18px;" class="grid">${rows || '<div class="card">No approved questions yet.</div>'}</section>
  `;
  return htmlResponse(renderLayout({
    title: 'Forum',
    content
  }));
}

async function handleForumAsk(env, req, url) {
  const form = await readForm(req);
  const resp = await submitQuestion(env, {
    title: form.title || '',
    content: form.content || '',
    name: form.name || '',
    email: form.email || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/forum', {
      err: parsed.data.error || 'Failed to submit question.'
    });
  }
  return redirectWithParams(url, '/forum', {
    ok: parsed.data.message || 'Question submitted.'
  });
}

async function renderForumQuestion(env, url, slug) {
  const question = await env.DB.prepare(`
    SELECT *
    FROM forum_questions
    WHERE slug = ? AND status = 'approved'
    LIMIT 1
  `).bind(slug).first();

  if (!question) {
    return htmlResponse(renderLayout({
      title: 'Question Not Found',
      content: '<h1>Question not found</h1><p><a class="btn secondary" href="/forum">Back to forum</a></p>'
    }), { status: 404 });
  }

  const repliesResult = await env.DB.prepare(`
    SELECT id, name, content, created_at
    FROM forum_replies
    WHERE question_id = ? AND status = 'approved'
    ORDER BY created_at ASC
    LIMIT 200
  `).bind(Number(question.id)).all();
  const replies = repliesResult.results || [];
  const repliesHtml = replies.map((r) => `
    <article class="card">
      <p><strong>${escapeHtml(r.name || 'User')}</strong> <span class="small muted">${escapeHtml(formatDate(r.created_at))}</span></p>
      <p>${escapeHtml(r.content || '')}</p>
    </article>
  `).join('');

  const content = `
    <h1>${escapeHtml(question.title || 'Question')}</h1>
    ${renderNotice(url)}
    <article class="card">
      <p>${escapeHtml(question.content || '')}</p>
      <p class="small muted">Asked by ${escapeHtml(question.name || 'User')} on ${escapeHtml(formatDate(question.created_at))}</p>
    </article>
    <section style="margin-top:18px;" class="card">
      <h2>Post Reply</h2>
      <form class="form-grid" method="post" action="/forum/${encodeURIComponent(String(question.id))}/reply">
        <div>
          <label>Name</label>
          <input type="text" name="name" required>
        </div>
        <div>
          <label>Email</label>
          <input type="email" name="email" required>
        </div>
        <div>
          <label>Reply</label>
          <textarea name="content" required></textarea>
        </div>
        <button class="btn" type="submit">Submit Reply</button>
      </form>
      <p class="small muted">Replies are moderated before approval.</p>
    </section>
    <section style="margin-top:18px;">
      <h2>Replies</h2>
      <div class="grid">${repliesHtml || '<div class="card">No approved replies yet.</div>'}</div>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: question.title || 'Forum Question',
    content
  }));
}

async function handleForumReply(env, req, url, questionId) {
  const form = await readForm(req);
  const question = await env.DB.prepare(
    'SELECT slug FROM forum_questions WHERE id = ? LIMIT 1'
  ).bind(Number(questionId)).first();
  const back = question ? `/forum/${encodeURIComponent(question.slug || '')}` : '/forum';
  const resp = await submitReply(env, {
    question_id: Number(questionId),
    content: form.content || '',
    name: form.name || '',
    email: form.email || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, back, {
      err: parsed.data.error || 'Failed to submit reply.'
    });
  }
  return redirectWithParams(url, back, {
    ok: parsed.data.message || 'Reply submitted.'
  });
}

function renderStatCard(title, value, note) {
  return `<article class="card"><h3>${escapeHtml(title)}</h3><p style="font-size:30px;margin:0;font-weight:800;">${escapeHtml(value)}</p><p class="muted">${escapeHtml(note || '')}</p></article>`;
}

async function renderAdminDashboard(env, url) {
  const [products, orders, pages, blogs, reviews] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM products').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM orders').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM pages').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM blogs').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM reviews').first()
  ]);

  const content = `
    <h1>Admin Dashboard (Level 2)</h1>
    ${renderNotice(url)}
    <p class="muted">This admin is fully server-rendered and form-driven. No client-side JavaScript is required.</p>
    <section class="grid grid-3">
      ${renderStatCard('Products', products?.c || 0, 'Catalog entries')}
      ${renderStatCard('Orders', orders?.c || 0, 'All order records')}
      ${renderStatCard('Pages', pages?.c || 0, 'Dynamic pages')}
      ${renderStatCard('Blogs', blogs?.c || 0, 'Blog posts')}
      ${renderStatCard('Reviews', reviews?.c || 0, 'Customer reviews')}
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Dashboard',
    admin: true,
    content
  }), { admin: true });
}

async function renderAdminProducts(env, url) {
  const editId = toNumber(url.searchParams.get('edit'));
  const rows = await env.DB.prepare(`
    SELECT id, title, slug, description, normal_price, sale_price, instant_delivery, normal_delivery_text, thumbnail_url, video_url, status
    FROM products
    ORDER BY id DESC
    LIMIT 300
  `).all();
  const products = rows.results || [];
  const edit = editId ? products.find((p) => Number(p.id) === editId) : null;

  const tableRows = products.map((p) => `
    <tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.title || '')}</td>
      <td>${escapeHtml(p.slug || '')}</td>
      <td>${formatMoney(p.sale_price && Number(p.sale_price) > 0 ? p.sale_price : p.normal_price)}</td>
      <td>${escapeHtml(p.status || 'active')}</td>
      <td>
        <div class="row">
          <a class="btn secondary small" href="/admin/products?edit=${encodeURIComponent(String(p.id))}">Edit</a>
          <form method="post" action="/admin/products/status">
            <input type="hidden" name="id" value="${escapeHtml(p.id)}">
            <input type="hidden" name="status" value="${p.status === 'active' ? 'inactive' : 'active'}">
            <button class="btn secondary small" type="submit">${p.status === 'active' ? 'Disable' : 'Enable'}</button>
          </form>
          <form method="post" action="/admin/products/delete">
            <input type="hidden" name="id" value="${escapeHtml(p.id)}">
            <button class="btn danger small" type="submit">Delete</button>
          </form>
        </div>
      </td>
    </tr>
  `).join('');

  const content = `
    <h1>Products</h1>
    ${renderNotice(url)}
    <section class="card">
      <h2>${edit ? 'Edit Product #' + escapeHtml(edit.id) : 'Create Product'}</h2>
      <form class="form-grid" method="post" action="/admin/products/save">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || '')}">
        <div><label>Title</label><input type="text" name="title" value="${escapeHtml(edit?.title || '')}" required></div>
        <div><label>Slug</label><input type="text" name="slug" value="${escapeHtml(edit?.slug || '')}"></div>
        <div><label>Description</label><textarea name="description">${escapeHtml(edit?.description || '')}</textarea></div>
        <div><label>Normal Price</label><input type="number" step="0.01" name="normal_price" value="${escapeHtml(edit?.normal_price || '0')}"></div>
        <div><label>Sale Price</label><input type="number" step="0.01" name="sale_price" value="${escapeHtml(edit?.sale_price || '')}"></div>
        <div><label>Delivery Days</label><input type="number" name="delivery_time_days" min="1" value="${escapeHtml(edit?.normal_delivery_text || '1')}"></div>
        <div><label>Thumbnail URL</label><input type="text" name="thumbnail_url" value="${escapeHtml(edit?.thumbnail_url || '')}"></div>
        <div><label>Video URL</label><input type="text" name="video_url" value="${escapeHtml(edit?.video_url || '')}"></div>
        <div>
          <label>Status</label>
          <select name="status">
            <option value="active" ${edit?.status !== 'inactive' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${edit?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        <div>
          <label>Instant Delivery</label>
          <select name="instant_delivery">
            <option value="0" ${edit?.instant_delivery ? '' : 'selected'}>No</option>
            <option value="1" ${edit?.instant_delivery ? 'selected' : ''}>Yes</option>
          </select>
        </div>
        <button class="btn" type="submit">${edit ? 'Update Product' : 'Create Product'}</button>
      </form>
    </section>
    <section class="card" style="margin-top:18px;overflow:auto;">
      <h2>All Products</h2>
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="6">No products found.</td></tr>'}</tbody>
      </table>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Products',
    admin: true,
    content
  }), { admin: true });
}

async function handleAdminProductSave(env, req, url) {
  const form = await readForm(req);
  const body = {
    id: form.id ? Number(form.id) : undefined,
    title: form.title || '',
    slug: form.slug || slugifyStr(form.title || ''),
    description: form.description || '',
    normal_price: toNumber(form.normal_price, 0),
    sale_price: form.sale_price ? toNumber(form.sale_price, 0) : null,
    instant_delivery: String(form.instant_delivery || '0') === '1',
    delivery_time_days: toNumber(form.delivery_time_days, 1),
    normal_delivery_text: String(toNumber(form.delivery_time_days, 1)),
    thumbnail_url: form.thumbnail_url || '',
    video_url: form.video_url || ''
  };
  const resp = await saveProduct(env, body);
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/products', {
      err: parsed.data.error || 'Failed to save product.'
    });
  }
  const productId = parsed.data.id || body.id;
  const status = String(form.status || 'active').toLowerCase();
  if (productId && (status === 'active' || status === 'inactive')) {
    await updateProductStatus(env, { id: Number(productId), status });
  }
  return redirectWithParams(url, '/admin/products', {
    ok: 'Product saved.'
  });
}

async function handleAdminProductDelete(env, req, url) {
  const form = await readForm(req);
  const resp = await deleteProduct(env, Number(form.id || 0));
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/products', { err: parsed.data.error || 'Delete failed.' });
  }
  return redirectWithParams(url, '/admin/products', { ok: 'Product deleted.' });
}

async function handleAdminProductStatus(env, req, url) {
  const form = await readForm(req);
  const resp = await updateProductStatus(env, {
    id: Number(form.id || 0),
    status: String(form.status || '').toLowerCase()
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/products', { err: parsed.data.error || 'Status update failed.' });
  }
  return redirectWithParams(url, '/admin/products', { ok: 'Product status updated.' });
}

async function renderAdminOrders(env, url) {
  const selectedOrderId = String(url.searchParams.get('view') || '').trim();
  const rows = await env.DB.prepare(`
    SELECT o.order_id, o.status, o.created_at, o.delivery_time_minutes, o.delivered_video_url, o.encrypted_data, p.title as product_title
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    ORDER BY o.id DESC
    LIMIT 300
  `).all();
  const orders = rows.results || [];
  const selectedOrder = selectedOrderId
    ? orders.find((o) => String(o.order_id || '') === selectedOrderId)
    : null;

  const tableRows = orders.map((o) => {
    const data = parseOrderEncryptedData(o.encrypted_data || '{}');
    const email = escapeHtml(data.email || '-');
    const amount = formatMoney(data.amount || 0);
    return `
      <tr>
        <td>${escapeHtml(o.order_id)}</td>
        <td>${escapeHtml(o.product_title || '-')}</td>
        <td>${email}</td>
        <td>${amount}</td>
        <td>${escapeHtml(o.status || '')}</td>
        <td>${escapeHtml(formatDate(o.created_at))}</td>
        <td>
          <form class="form-grid" method="post" action="/admin/orders/update">
            <input type="hidden" name="order_id" value="${escapeHtml(o.order_id)}">
            <select name="status">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>pending</option>
              <option value="PAID" ${o.status === 'PAID' ? 'selected' : ''}>PAID</option>
              <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>delivered</option>
              <option value="revision" ${o.status === 'revision' ? 'selected' : ''}>revision</option>
            </select>
            <input type="number" name="delivery_time_minutes" min="1" value="${escapeHtml(o.delivery_time_minutes || 60)}">
            <button class="btn secondary small" type="submit">Update</button>
          </form>
          <form class="form-grid" method="post" action="/admin/orders/deliver" style="margin-top:8px;">
            <input type="hidden" name="order_id" value="${escapeHtml(o.order_id)}">
            <input type="text" name="download_url" placeholder="Delivered video URL">
            <input type="text" name="youtube_url" placeholder="YouTube URL (optional)">
            <button class="btn small" type="submit">Mark Delivered</button>
          </form>
          <form method="post" action="/admin/orders/delete" style="margin-top:8px;">
            <input type="hidden" name="order_id" value="${escapeHtml(o.order_id)}">
            <button class="btn danger small" type="submit">Delete</button>
          </form>
          <p style="margin-top:8px;"><a class="btn secondary small" href="/admin/orders?view=${encodeURIComponent(String(o.order_id || ''))}">View Details</a></p>
        </td>
      </tr>
    `;
  }).join('');

  const selectedOrderData = selectedOrder ? parseOrderEncryptedData(selectedOrder.encrypted_data || '{}') : null;
  const detailCard = selectedOrder ? `
    <section class="card" style="margin-bottom:16px;">
      <div class="row" style="justify-content:space-between;">
        <h2 style="margin:0;">Order Detail: ${escapeHtml(selectedOrder.order_id || '')}</h2>
        <a class="btn secondary small" href="/admin/orders">Close</a>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div>
          <p><strong>Product:</strong> ${escapeHtml(selectedOrder.product_title || '-')}</p>
          <p><strong>Status:</strong> ${escapeHtml(selectedOrder.status || '-')}</p>
          <p><strong>Created:</strong> ${escapeHtml(formatDate(selectedOrder.created_at))}</p>
          <p><strong>Delivery ETA:</strong> ${escapeHtml(selectedOrder.delivery_time_minutes || 60)} minute(s)</p>
        </div>
        <div>
          <p><strong>Email:</strong> ${escapeHtml(selectedOrderData?.email || '-')}</p>
          <p><strong>Amount:</strong> ${formatMoney(selectedOrderData?.amount || 0)}</p>
          <p><strong>Buyer Name:</strong> ${escapeHtml(selectedOrderData?.name || selectedOrderData?.customer_name || '-')}</p>
          <p><strong>Delivered URL:</strong> ${selectedOrder.delivered_video_url ? `<a href="${escapeHtml(selectedOrder.delivered_video_url)}" target="_blank" rel="noreferrer">Open</a>` : '-'}</p>
        </div>
      </div>
    </section>
  ` : '';

  const content = `
    <h1>Orders</h1>
    ${renderNotice(url)}
    ${detailCard}
    <section class="card" style="overflow:auto;">
      <table>
        <thead><tr><th>Order</th><th>Product</th><th>Email</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="7">No orders found.</td></tr>'}</tbody>
      </table>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Orders',
    admin: true,
    content
  }), { admin: true });
}

async function handleAdminOrderUpdate(env, req, url) {
  const form = await readForm(req);
  const resp = await updateOrder(env, {
    orderId: form.order_id || '',
    status: form.status || '',
    delivery_time_minutes: toNumber(form.delivery_time_minutes, 60)
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/orders', { err: parsed.data.error || 'Order update failed.' });
  }
  return redirectWithParams(url, '/admin/orders', { ok: 'Order updated.' });
}

async function handleAdminOrderDeliver(env, req, url) {
  const form = await readForm(req);
  const resp = await deliverOrder(env, {
    orderId: form.order_id || '',
    downloadUrl: form.download_url || '',
    youtubeUrl: form.youtube_url || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/orders', { err: parsed.data.error || 'Delivery update failed.' });
  }
  return redirectWithParams(url, '/admin/orders', { ok: 'Order marked as delivered.' });
}

async function handleAdminOrderDelete(env, req, url) {
  const form = await readForm(req);
  const resp = await deleteOrder(env, form.order_id || '');
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/orders', { err: parsed.data.error || 'Delete failed.' });
  }
  return redirectWithParams(url, '/admin/orders', { ok: 'Order deleted.' });
}

async function renderAdminPages(env, url) {
  const editId = toNumber(url.searchParams.get('edit'));
  const rows = await env.DB.prepare(`
    SELECT id, slug, title, meta_description, content, page_type, is_default, status, updated_at
    FROM pages
    ORDER BY id DESC
    LIMIT 250
  `).all();
  const pages = rows.results || [];
  const edit = editId ? pages.find((p) => Number(p.id) === editId) : null;

  const tableRows = pages.map((p) => `
    <tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(p.slug || '')}</td>
      <td>${escapeHtml(p.title || '')}</td>
      <td>${escapeHtml(p.page_type || 'custom')}</td>
      <td>${p.is_default ? 'yes' : 'no'}</td>
      <td>${escapeHtml(p.status || '')}</td>
      <td>${escapeHtml(formatDate(p.updated_at))}</td>
      <td>
        <div class="row">
          <a class="btn secondary small" href="/admin/pages?edit=${encodeURIComponent(String(p.id))}">Edit</a>
          <form method="post" action="/admin/pages/status">
            <input type="hidden" name="id" value="${escapeHtml(p.id)}">
            <input type="hidden" name="status" value="${p.status === 'published' ? 'draft' : 'published'}">
            <button class="btn secondary small" type="submit">${p.status === 'published' ? 'Draft' : 'Publish'}</button>
          </form>
          <form method="post" action="/admin/pages/delete">
            <input type="hidden" name="id" value="${escapeHtml(p.id)}">
            <button class="btn danger small" type="submit">Delete</button>
          </form>
        </div>
      </td>
    </tr>
  `).join('');

  const content = `
    <h1>Pages</h1>
    ${renderNotice(url)}
    <section class="card">
      <h2>${edit ? 'Edit Page #' + escapeHtml(edit.id) : 'Create Page'}</h2>
      <form class="form-grid" method="post" action="/admin/pages/save">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || '')}">
        <div><label>Title</label><input type="text" name="title" value="${escapeHtml(edit?.title || '')}" required></div>
        <div><label>Slug</label><input type="text" name="slug" value="${escapeHtml(edit?.slug || '')}"></div>
        <div><label>Meta Description</label><textarea name="meta_description">${escapeHtml(edit?.meta_description || '')}</textarea></div>
        <div><label>Content (HTML allowed)</label><textarea name="content">${escapeHtml(edit?.content || '')}</textarea></div>
        <div>
          <label>Page Type</label>
          <select name="page_type">
            <option value="custom" ${(edit?.page_type || 'custom') === 'custom' ? 'selected' : ''}>custom</option>
            <option value="home" ${edit?.page_type === 'home' ? 'selected' : ''}>home</option>
            <option value="blog_archive" ${edit?.page_type === 'blog_archive' ? 'selected' : ''}>blog_archive</option>
            <option value="forum_archive" ${edit?.page_type === 'forum_archive' ? 'selected' : ''}>forum_archive</option>
            <option value="product_grid" ${edit?.page_type === 'product_grid' ? 'selected' : ''}>product_grid</option>
          </select>
        </div>
        <div>
          <label>Status</label>
          <select name="status">
            <option value="published" ${(edit?.status || 'published') === 'published' ? 'selected' : ''}>published</option>
            <option value="draft" ${edit?.status === 'draft' ? 'selected' : ''}>draft</option>
          </select>
        </div>
        <div>
          <label>Set as default for type?</label>
          <select name="is_default">
            <option value="0" ${edit?.is_default ? '' : 'selected'}>No</option>
            <option value="1" ${edit?.is_default ? 'selected' : ''}>Yes</option>
          </select>
        </div>
        <button class="btn" type="submit">${edit ? 'Update Page' : 'Create Page'}</button>
      </form>
    </section>
    <section class="card" style="margin-top:18px;overflow:auto;">
      <table>
        <thead><tr><th>ID</th><th>Slug</th><th>Title</th><th>Type</th><th>Default</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="8">No pages found.</td></tr>'}</tbody>
      </table>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Pages',
    admin: true,
    content
  }), { admin: true });
}

async function handleAdminPageSave(env, req, url) {
  const form = await readForm(req);
  const resp = await savePage(env, {
    id: form.id ? Number(form.id) : undefined,
    title: form.title || '',
    slug: form.slug || '',
    content: form.content || '',
    meta_description: form.meta_description || '',
    page_type: form.page_type || 'custom',
    is_default: String(form.is_default || '0') === '1',
    status: form.status || 'published'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/pages', { err: parsed.data.error || 'Failed to save page.' });
  }
  return redirectWithParams(url, '/admin/pages', { ok: 'Page saved.' });
}

async function handleAdminPageStatus(env, req, url) {
  const form = await readForm(req);
  const resp = await updatePageStatus(env, {
    id: Number(form.id || 0),
    status: form.status || ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/pages', { err: parsed.data.error || 'Status update failed.' });
  }
  return redirectWithParams(url, '/admin/pages', { ok: 'Page status updated.' });
}

async function handleAdminPageDelete(env, req, url) {
  const form = await readForm(req);
  const resp = await deletePage(env, Number(form.id || 0));
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/pages', { err: parsed.data.error || 'Delete failed.' });
  }
  return redirectWithParams(url, '/admin/pages', { ok: 'Page deleted.' });
}

async function renderAdminBlogs(env, url) {
  const editId = toNumber(url.searchParams.get('edit'));
  const rows = await env.DB.prepare(`
    SELECT id, title, slug, description, content, thumbnail_url, status, created_at, updated_at
    FROM blogs
    ORDER BY created_at DESC
    LIMIT 250
  `).all();
  const blogs = rows.results || [];
  const edit = editId ? blogs.find((b) => Number(b.id) === editId) : null;

  const tableRows = blogs.map((b) => `
    <tr>
      <td>${escapeHtml(b.id)}</td>
      <td>${escapeHtml(b.title || '')}</td>
      <td>${escapeHtml(b.slug || '')}</td>
      <td>${escapeHtml(b.status || '')}</td>
      <td>${escapeHtml(formatDate(b.updated_at || b.created_at))}</td>
      <td>
        <div class="row">
          <a class="btn secondary small" href="/admin/blogs?edit=${encodeURIComponent(String(b.id))}">Edit</a>
          <form method="post" action="/admin/blogs/status">
            <input type="hidden" name="id" value="${escapeHtml(b.id)}">
            <input type="hidden" name="status" value="${b.status === 'published' ? 'draft' : 'published'}">
            <button class="btn secondary small" type="submit">${b.status === 'published' ? 'Draft' : 'Publish'}</button>
          </form>
          <form method="post" action="/admin/blogs/delete">
            <input type="hidden" name="id" value="${escapeHtml(b.id)}">
            <button class="btn danger small" type="submit">Delete</button>
          </form>
        </div>
      </td>
    </tr>
  `).join('');

  const content = `
    <h1>Blogs</h1>
    ${renderNotice(url)}
    <section class="card">
      <h2>${edit ? 'Edit Blog #' + escapeHtml(edit.id) : 'Create Blog'}</h2>
      <form class="form-grid" method="post" action="/admin/blogs/save">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || '')}">
        <div><label>Title</label><input type="text" name="title" value="${escapeHtml(edit?.title || '')}" required></div>
        <div><label>Slug</label><input type="text" name="slug" value="${escapeHtml(edit?.slug || '')}"></div>
        <div><label>Description</label><textarea name="description">${escapeHtml(edit?.description || '')}</textarea></div>
        <div><label>Thumbnail URL</label><input type="text" name="thumbnail_url" value="${escapeHtml(edit?.thumbnail_url || '')}"></div>
        <div><label>Content (HTML allowed)</label><textarea name="content">${escapeHtml(edit?.content || '')}</textarea></div>
        <div>
          <label>Status</label>
          <select name="status">
            <option value="draft" ${(edit?.status || 'draft') === 'draft' ? 'selected' : ''}>draft</option>
            <option value="published" ${edit?.status === 'published' ? 'selected' : ''}>published</option>
          </select>
        </div>
        <button class="btn" type="submit">${edit ? 'Update Blog' : 'Create Blog'}</button>
      </form>
    </section>
    <section class="card" style="margin-top:18px;overflow:auto;">
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="6">No blogs found.</td></tr>'}</tbody>
      </table>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Blogs',
    admin: true,
    content
  }), { admin: true });
}

async function handleAdminBlogSave(env, req, url) {
  const form = await readForm(req);
  const resp = await saveBlog(env, {
    id: form.id ? Number(form.id) : undefined,
    title: form.title || '',
    slug: form.slug || '',
    description: form.description || '',
    thumbnail_url: form.thumbnail_url || '',
    content: form.content || '',
    status: form.status || 'draft',
    custom_css: '',
    custom_js: ''
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/blogs', { err: parsed.data.error || 'Failed to save blog.' });
  }
  return redirectWithParams(url, '/admin/blogs', { ok: 'Blog saved.' });
}

async function handleAdminBlogStatus(env, req, url) {
  const form = await readForm(req);
  const resp = await updateBlogStatus(env, {
    id: Number(form.id || 0),
    status: form.status || 'draft'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/blogs', { err: parsed.data.error || 'Status update failed.' });
  }
  return redirectWithParams(url, '/admin/blogs', { ok: 'Blog status updated.' });
}

async function handleAdminBlogDelete(env, req, url) {
  const form = await readForm(req);
  const resp = await deleteBlog(env, Number(form.id || 0));
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/blogs', { err: parsed.data.error || 'Delete failed.' });
  }
  return redirectWithParams(url, '/admin/blogs', { ok: 'Blog deleted.' });
}

async function renderAdminModeration(env, url) {
  const [reviewsR, commentsR, questionsR, repliesR] = await Promise.all([
    env.DB.prepare('SELECT id, author_name, rating, comment, status, created_at FROM reviews ORDER BY id DESC LIMIT 80').all(),
    env.DB.prepare('SELECT id, blog_id, name, comment, status, created_at FROM blog_comments ORDER BY id DESC LIMIT 80').all(),
    env.DB.prepare('SELECT id, title, name, status, created_at FROM forum_questions ORDER BY id DESC LIMIT 80').all(),
    env.DB.prepare('SELECT id, question_id, name, content, status, created_at FROM forum_replies ORDER BY id DESC LIMIT 80').all()
  ]);

  const reviews = reviewsR.results || [];
  const comments = commentsR.results || [];
  const questions = questionsR.results || [];
  const replies = repliesR.results || [];

  const reviewRows = reviews.map((r) => `
    <tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.author_name || '')}</td>
      <td>${escapeHtml(r.rating || 0)}</td>
      <td>${escapeHtml((r.comment || '').slice(0, 120))}</td>
      <td>${escapeHtml(r.status || '')}</td>
      <td>
        <form class="row" method="post" action="/admin/moderation/review">
          <input type="hidden" name="id" value="${escapeHtml(r.id)}">
          <select name="status">
            <option value="approved">approved</option>
            <option value="pending">pending</option>
            <option value="rejected">rejected</option>
          </select>
          <button class="btn secondary small" type="submit">Apply</button>
        </form>
      </td>
    </tr>
  `).join('');

  const commentRows = comments.map((c) => `
    <tr>
      <td>${escapeHtml(c.id)}</td>
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml((c.comment || '').slice(0, 120))}</td>
      <td>${escapeHtml(c.status || '')}</td>
      <td>
        <form class="row" method="post" action="/admin/moderation/comment">
          <input type="hidden" name="id" value="${escapeHtml(c.id)}">
          <select name="status">
            <option value="approved">approved</option>
            <option value="pending">pending</option>
            <option value="rejected">rejected</option>
          </select>
          <button class="btn secondary small" type="submit">Apply</button>
        </form>
      </td>
    </tr>
  `).join('');

  const questionRows = questions.map((q) => `
    <tr>
      <td>${escapeHtml(q.id)}</td>
      <td>${escapeHtml((q.title || '').slice(0, 120))}</td>
      <td>${escapeHtml(q.name || '')}</td>
      <td>${escapeHtml(q.status || '')}</td>
      <td>
        <form class="row" method="post" action="/admin/moderation/question">
          <input type="hidden" name="id" value="${escapeHtml(q.id)}">
          <select name="status">
            <option value="approved">approved</option>
            <option value="pending">pending</option>
            <option value="rejected">rejected</option>
          </select>
          <button class="btn secondary small" type="submit">Apply</button>
        </form>
      </td>
    </tr>
  `).join('');

  const replyRows = replies.map((r) => `
    <tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.question_id || '')}</td>
      <td>${escapeHtml(r.name || '')}</td>
      <td>${escapeHtml((r.content || '').slice(0, 120))}</td>
      <td>${escapeHtml(r.status || '')}</td>
      <td>
        <form class="row" method="post" action="/admin/moderation/reply">
          <input type="hidden" name="id" value="${escapeHtml(r.id)}">
          <select name="status">
            <option value="approved">approved</option>
            <option value="pending">pending</option>
            <option value="rejected">rejected</option>
          </select>
          <button class="btn secondary small" type="submit">Apply</button>
        </form>
      </td>
    </tr>
  `).join('');

  const content = `
    <h1>Moderation</h1>
    ${renderNotice(url)}
    <section class="card" style="overflow:auto;">
      <h2>Reviews</h2>
      <table><thead><tr><th>ID</th><th>Author</th><th>Rating</th><th>Comment</th><th>Status</th><th>Action</th></tr></thead><tbody>${reviewRows || '<tr><td colspan="6">No reviews.</td></tr>'}</tbody></table>
    </section>
    <section class="card" style="overflow:auto;margin-top:18px;">
      <h2>Blog Comments</h2>
      <table><thead><tr><th>ID</th><th>Name</th><th>Comment</th><th>Status</th><th>Action</th></tr></thead><tbody>${commentRows || '<tr><td colspan="5">No comments.</td></tr>'}</tbody></table>
    </section>
    <section class="card" style="overflow:auto;margin-top:18px;">
      <h2>Forum Questions</h2>
      <table><thead><tr><th>ID</th><th>Title</th><th>Name</th><th>Status</th><th>Action</th></tr></thead><tbody>${questionRows || '<tr><td colspan="5">No questions.</td></tr>'}</tbody></table>
    </section>
    <section class="card" style="overflow:auto;margin-top:18px;">
      <h2>Forum Replies</h2>
      <table><thead><tr><th>ID</th><th>Question ID</th><th>Name</th><th>Reply</th><th>Status</th><th>Action</th></tr></thead><tbody>${replyRows || '<tr><td colspan="6">No replies.</td></tr>'}</tbody></table>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Moderation',
    admin: true,
    content
  }), { admin: true });
}

async function handleAdminModerationReview(env, req, url) {
  const form = await readForm(req);
  const resp = await updateReview(env, {
    id: Number(form.id || 0),
    status: form.status || 'pending'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/moderation', { err: parsed.data.error || 'Review moderation failed.' });
  }
  return redirectWithParams(url, '/admin/moderation', { ok: 'Review updated.' });
}

async function handleAdminModerationComment(env, req, url) {
  const form = await readForm(req);
  const resp = await updateCommentStatus(env, {
    id: Number(form.id || 0),
    status: form.status || 'pending'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/moderation', { err: parsed.data.error || 'Comment moderation failed.' });
  }
  return redirectWithParams(url, '/admin/moderation', { ok: 'Comment updated.' });
}

async function handleAdminModerationQuestion(env, req, url) {
  const form = await readForm(req);
  const resp = await updateQuestionStatus(env, {
    id: Number(form.id || 0),
    status: form.status || 'pending'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/moderation', { err: parsed.data.error || 'Question moderation failed.' });
  }
  return redirectWithParams(url, '/admin/moderation', { ok: 'Question updated.' });
}

async function handleAdminModerationReply(env, req, url) {
  const form = await readForm(req);
  const resp = await updateReplyStatus(env, {
    id: Number(form.id || 0),
    status: form.status || 'pending'
  });
  const parsed = await readJsonResponse(resp);
  if (!parsed.ok || !parsed.data.success) {
    return redirectWithParams(url, '/admin/moderation', { err: parsed.data.error || 'Reply moderation failed.' });
  }
  return redirectWithParams(url, '/admin/moderation', { ok: 'Reply updated.' });
}

export function renderNoJsAdminLoginPage(url) {
  const err = url.searchParams.get('err');
  const content = `
    <h1>Admin Login</h1>
    ${err ? `<div class="notice error">${escapeHtml(err)}</div>` : ''}
    <section class="card" style="max-width:520px;">
      <form class="form-grid" method="post" action="/admin/login">
        <div>
          <label>Email</label>
          <input type="email" name="email" required>
        </div>
        <div>
          <label>Password</label>
          <input type="password" name="password" required>
        </div>
        <button class="btn" type="submit">Sign In</button>
      </form>
    </section>
  `;
  return htmlResponse(renderLayout({
    title: 'Admin Login',
    admin: true,
    content
  }), { admin: true });
}

export async function handleNoJsRoutes(req, env, url, path, method) {
  // Public storefront routes (Level 1)
  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    return renderHome(env, url);
  }

  if (method === 'GET' && (
    path === '/products' ||
    path === '/products/' ||
    path === '/products.html' ||
    path === '/products-grid' ||
    path === '/products-grid/' ||
    path === '/products-grid.html'
  )) {
    return renderProductsArchive(env, url);
  }

  if (method === 'GET' && (path === '/product' || path === '/product/')) {
    const pid = Number(url.searchParams.get('id') || 0);
    if (!pid) return Response.redirect(new URL('/', url.origin).toString(), 302);
    const canonical = await resolveProductPath(env, pid);
    if (url.searchParams.get('cancelled') === '1') {
      return redirectWithParams(url, canonical, { err: 'Payment was cancelled.' });
    }
    return Response.redirect(new URL(canonical, url.origin).toString(), 302);
  }

  const productMatch = path.match(/^\/product-(\d+)(?:\/[^/]+)?\/?$/);
  if (method === 'GET' && productMatch) {
    return renderProduct(env, url, Number(productMatch[1]));
  }

  if (method === 'POST' && path === '/order/create') {
    return handleCreateOrder(env, req, url);
  }

  if (method === 'GET' && (path === '/checkout' || path === '/checkout/' || path === '/checkout.html')) {
    const pid = Number(url.searchParams.get('id') || url.searchParams.get('product_id') || 0);
    if (pid > 0) {
      const canonical = await resolveProductPath(env, pid);
      return Response.redirect(new URL(canonical, url.origin).toString(), 302);
    }
    return redirectWithParams(url, '/products', { err: 'Choose a product to continue checkout.' }, 302);
  }

  if (method === 'GET' && (path === '/success' || path === '/success.html')) {
    return renderSuccess(env, url, req);
  }

  if (method === 'GET' && (path === '/order-success' || path === '/order-success/' || path === '/order-success.html')) {
    return Response.redirect(new URL('/success', url.origin).toString(), 302);
  }

  const orderMatch = path.match(/^\/order\/([^/]+)$/);
  if (method === 'GET' && orderMatch) {
    return renderOrder(env, url, decodeURIComponent(orderMatch[1]));
  }

  if (method === 'GET' && (path === '/buyer-order' || path === '/buyer-order/' || path === '/buyer-order.html')) {
    const orderId = String(url.searchParams.get('id') || '').trim();
    if (!orderId) return redirectWithParams(url, '/', { err: 'Order id is required.' }, 302);
    return Response.redirect(new URL(`/order/${encodeURIComponent(orderId)}`, url.origin).toString(), 302);
  }

  if (method === 'GET' && (path === '/order-detail' || path === '/order-detail/' || path === '/order-detail.html')) {
    const orderId = String(url.searchParams.get('id') || '').trim();
    const target = orderId
      ? `/admin/orders?view=${encodeURIComponent(orderId)}`
      : '/admin/orders';
    return Response.redirect(new URL(target, url.origin).toString(), 302);
  }

  const orderReviewMatch = path.match(/^\/order\/([^/]+)\/review$/);
  if (method === 'POST' && orderReviewMatch) {
    return handleOrderReview(env, req, url, decodeURIComponent(orderReviewMatch[1]));
  }

  if (method === 'GET' && (path === '/blog' || path === '/blog/' || path === '/blog/index.html' || path === '/blog.html')) {
    return renderBlogList(env, url);
  }

  const blogCommentMatch = path.match(/^\/blog\/([^/]+)\/comment$/);
  if (method === 'POST' && blogCommentMatch) {
    return handleBlogComment(env, req, url, decodeURIComponent(blogCommentMatch[1]));
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  if (method === 'GET' && blogMatch) {
    return renderBlogPost(env, url, decodeURIComponent(blogMatch[1]));
  }

  if (method === 'GET' && (path === '/forum' || path === '/forum/' || path === '/forum/index.html' || path === '/forum.html')) {
    return renderForumList(env, url);
  }

  if (method === 'POST' && path === '/forum/ask') {
    return handleForumAsk(env, req, url);
  }

  const forumReplyMatch = path.match(/^\/forum\/(\d+)\/reply$/);
  if (method === 'POST' && forumReplyMatch) {
    return handleForumReply(env, req, url, Number(forumReplyMatch[1]));
  }

  const forumQuestionMatch = path.match(/^\/forum\/([^/]+)$/);
  if (method === 'GET' && forumQuestionMatch) {
    return renderForumQuestion(env, url, decodeURIComponent(forumQuestionMatch[1]));
  }

  // Admin routes (Level 2)
  if (method === 'GET' && (
    path === '/admin' ||
    path === '/admin/' ||
    path === '/admin/dashboard.html'
  )) {
    return renderAdminDashboard(env, url);
  }

  if (method === 'GET' && (path === '/admin/products' || path === '/admin/product-form.html')) {
    return renderAdminProducts(env, url);
  }
  if (method === 'POST' && path === '/admin/products/save') {
    return handleAdminProductSave(env, req, url);
  }
  if (method === 'POST' && path === '/admin/products/delete') {
    return handleAdminProductDelete(env, req, url);
  }
  if (method === 'POST' && path === '/admin/products/status') {
    return handleAdminProductStatus(env, req, url);
  }

  if (method === 'GET' && (path === '/admin/orders' || path === '/admin/orders.html')) {
    return renderAdminOrders(env, url);
  }
  if (method === 'POST' && path === '/admin/orders/update') {
    return handleAdminOrderUpdate(env, req, url);
  }
  if (method === 'POST' && path === '/admin/orders/deliver') {
    return handleAdminOrderDeliver(env, req, url);
  }
  if (method === 'POST' && path === '/admin/orders/delete') {
    return handleAdminOrderDelete(env, req, url);
  }

  if (method === 'GET' && (
    path === '/admin/pages' ||
    path === '/admin/page-builder.html' ||
    path === '/admin/landing-builder.html'
  )) {
    return renderAdminPages(env, url);
  }
  if (method === 'POST' && path === '/admin/pages/save') {
    return handleAdminPageSave(env, req, url);
  }
  if (method === 'POST' && path === '/admin/pages/status') {
    return handleAdminPageStatus(env, req, url);
  }
  if (method === 'POST' && path === '/admin/pages/delete') {
    return handleAdminPageDelete(env, req, url);
  }

  if (method === 'GET' && (path === '/admin/blogs' || path === '/admin/blog-form.html')) {
    return renderAdminBlogs(env, url);
  }
  if (method === 'POST' && path === '/admin/blogs/save') {
    return handleAdminBlogSave(env, req, url);
  }
  if (method === 'POST' && path === '/admin/blogs/status') {
    return handleAdminBlogStatus(env, req, url);
  }
  if (method === 'POST' && path === '/admin/blogs/delete') {
    return handleAdminBlogDelete(env, req, url);
  }

  if (method === 'GET' && (
    path === '/admin/moderation' ||
    path === '/admin/migrate-reviews.html'
  )) {
    return renderAdminModeration(env, url);
  }
  if (method === 'POST' && path === '/admin/moderation/review') {
    return handleAdminModerationReview(env, req, url);
  }
  if (method === 'POST' && path === '/admin/moderation/comment') {
    return handleAdminModerationComment(env, req, url);
  }
  if (method === 'POST' && path === '/admin/moderation/question') {
    return handleAdminModerationQuestion(env, req, url);
  }
  if (method === 'POST' && path === '/admin/moderation/reply') {
    return handleAdminModerationReply(env, req, url);
  }

  const customPageMatch = path.match(/^\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
  if (method === 'GET' && customPageMatch) {
    const slug = String(customPageMatch[1] || '').trim().toLowerCase();
    if (!NOJS_RESERVED_PUBLIC_SLUGS.has(slug)) {
      const pageResponse = await renderCustomPage(env, url, slug);
      if (pageResponse) return pageResponse;
    }
  }

  // Fallback: keep admin inside no-JS dashboard routes.
  if (method === 'GET' && path.startsWith('/admin/') && !path.startsWith('/admin/login') && !path.startsWith('/admin/logout')) {
    return Response.redirect(new URL('/admin', url.origin).toString(), 302);
  }

  return null;
}
