;(function() {
  const INTENT_KEY = 'whop_checkout_intent_v1';
  const LEGACY_KEY = 'pendingOrderData';
  const INTENT_MAX_AGE_MS = 45 * 60 * 1000;
  const WHOP_METADATA_SAFE_MAX = 470;
  const WHOP_ADDONS_MAX_ITEMS = 8;

  let loaderPromise = null;
  let selectedMethodId = '';

  function extractErrorMessage(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'string') {
      const msg = value.trim();
      return msg || fallback;
    }
    if (value instanceof Error) {
      return extractErrorMessage(value.message, fallback);
    }
    if (typeof value === 'object') {
      const fields = [value.error, value.message, value.detail, value.details, value.reason];
      for (const field of fields) {
        const msg = extractErrorMessage(field, '');
        if (msg) return msg;
      }
      try {
        const serialized = JSON.stringify(value);
        if (serialized && serialized !== '{}' && serialized !== '[]') return serialized;
      } catch (e) {}
    }
    try {
      const msg = String(value).trim();
      return msg || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function setStatus(message, type) {
    const el = document.getElementById('checkout-status');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    el.className = `status ${type || 'info'}`;
    el.textContent = message;
  }

  function setBackLink(url) {
    const link = document.getElementById('checkout-back-link');
    if (!link) return;
    link.href = url || '/';
  }

  function setupSummaryDetailsMode() {
    const details = document.getElementById('summary-details');
    if (!details || !window.matchMedia) return;

    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => {
      if (mq.matches) {
        details.removeAttribute('open');
      } else {
        details.setAttribute('open', '');
      }
    };

    apply();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(apply);
    }
  }

  function clearIntentStorage() {
    try { sessionStorage.removeItem(INTENT_KEY); } catch (e) {}
    try { localStorage.removeItem(INTENT_KEY); } catch (e) {}
  }

  function readJsonStorage(storage, key) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function normalizeIntent(rawIntent) {
    if (!rawIntent || typeof rawIntent !== 'object') return null;

    const createdAt = Number(rawIntent.created_at || rawIntent.createdAt || 0) || Date.now();
    if (Date.now() - createdAt > INTENT_MAX_AGE_MS) return null;

    const productId = Number(rawIntent.productId || rawIntent.product_id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    const flowTypeRaw = String(rawIntent.flowType || rawIntent.flow_type || '').trim().toLowerCase();
    const flowType = flowTypeRaw === 'tip' ? 'tip' : 'order';
    const tipOrderId = flowType === 'tip'
      ? String(rawIntent.tipOrderId || rawIntent.tip_order_id || rawIntent.orderId || rawIntent.order_id || '').trim()
      : '';
    const tipAmountRaw = Number(rawIntent.tipAmount || rawIntent.tip_amount || rawIntent.amount || 0);
    const amount = Number(rawIntent.amount || 0);
    const resolvedTipAmount = (flowType === 'tip' && Number.isFinite(tipAmountRaw) && tipAmountRaw > 0)
      ? tipAmountRaw
      : amount;
    const originalAmount = Number(rawIntent.originalAmount || rawIntent.original_amount || amount || 0);
    const delivery = Number(rawIntent.deliveryTimeMinutes || rawIntent.delivery_time_minutes || 60) || 60;
    const finalAmount = flowType === 'tip' ? resolvedTipAmount : amount;

    if (flowType === 'tip' && (!tipOrderId || !Number.isFinite(finalAmount) || finalAmount <= 0)) {
      return null;
    }

    return {
      created_at: createdAt,
      productId,
      amount: Number.isFinite(finalAmount) ? finalAmount : 0,
      originalAmount: Number.isFinite(originalAmount) ? originalAmount : 0,
      email: (rawIntent.email || '').trim(),
      addons: Array.isArray(rawIntent.addons) ? rawIntent.addons : [],
      coupon: rawIntent.coupon || null,
      deliveryTimeMinutes: delivery,
      sourceUrl: rawIntent.sourceUrl || rawIntent.source_url || '',
      productTitle: rawIntent.productTitle || rawIntent.product_title || '',
      productThumbnail: rawIntent.productThumbnail || rawIntent.product_thumbnail || '',
      preferredMethod: rawIntent.preferredMethod || rawIntent.preferred_method || '',
      availableMethods: Array.isArray(rawIntent.availableMethods) ? rawIntent.availableMethods : [],
      flowType,
      tipOrderId,
      tipAmount: Number.isFinite(resolvedTipAmount) ? resolvedTipAmount : 0,
      tipReturnUrl: flowType === 'tip'
        ? String(rawIntent.tipReturnUrl || rawIntent.tip_return_url || rawIntent.sourceUrl || '').trim()
        : ''
    };
  }

  function loadIntent() {
    const candidates = [];
    try {
      const fromSession = readJsonStorage(sessionStorage, INTENT_KEY);
      if (fromSession) candidates.push(fromSession);
    } catch (e) {}
    try {
      const fromLocal = readJsonStorage(localStorage, INTENT_KEY);
      if (fromLocal) candidates.push(fromLocal);
    } catch (e) {}

    for (const candidate of candidates) {
      const normalized = normalizeIntent(candidate);
      if (normalized) return normalized;
    }

    try {
      const legacy = readJsonStorage(localStorage, LEGACY_KEY);
      if (!legacy) return null;
      return normalizeIntent({
        created_at: legacy.timestamp || Date.now(),
        productId: legacy.productId,
        amount: legacy.amount,
        originalAmount: legacy.originalAmount,
        email: legacy.email,
        addons: legacy.addons,
        coupon: legacy.coupon,
        deliveryTimeMinutes: legacy.deliveryTimeMinutes,
        productTitle: legacy.productTitle || legacy.product_title || '',
        productThumbnail: legacy.productThumbnail || legacy.product_thumbnail || '',
        preferredMethod: legacy.preferredMethod || legacy.preferred_method || '',
        availableMethods: Array.isArray(legacy.availableMethods) ? legacy.availableMethods : []
      });
    } catch (e) {
      return null;
    }
  }

  async function fetchProductDetails(productId) {
    if (!productId) return null;
    try {
      const response = await fetch(`/api/product/${encodeURIComponent(String(productId))}`);
      if (!response.ok) return null;

      const data = await response.json().catch(() => ({}));
      const product = data && data.product ? data.product : null;
      if (!product) return null;

      return {
        title: (product.title || '').trim(),
        thumbnail: (product.thumbnail_url || '').trim()
      };
    } catch (e) {
      return null;
    }
  }

  function normalizeMethodId(methodId) {
    const raw = String(methodId || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'paypal_redirect') return 'paypal';
    return raw;
  }

  function sanitizeMethods(methods) {
    if (!Array.isArray(methods)) return [];

    const out = [];
    const seen = new Set();

    methods.forEach((method) => {
      if (!method || typeof method !== 'object') return;
      if (method.enabled === false) return;

      const normalizedId = normalizeMethodId(method.id);
      if (!normalizedId || seen.has(normalizedId)) return;
      seen.add(normalizedId);

      out.push({
        id: method.id,
        normalizedId,
        name: method.name || normalizedId,
        icon: method.icon || '',
        client_id: method.client_id || ''
      });
    });

    return out;
  }

  async function loadPaymentMethods(intent) {
    try {
      const response = await fetch('/api/payment/methods');
      if (!response.ok) throw new Error('payment-methods-failed');
      const data = await response.json().catch(() => ({}));
      const methods = sanitizeMethods(data.methods || []);
      if (methods.length) return methods;
    } catch (e) {}

    const fromIntent = sanitizeMethods(intent && intent.availableMethods ? intent.availableMethods : []);
    if (fromIntent.length) return fromIntent;

    return [{ id: 'whop', normalizedId: 'whop', name: 'Whop', icon: '' }];
  }

  function pickDefaultMethod(methods, intent) {
    const preferred = normalizeMethodId(intent && intent.preferredMethod);
    if (preferred && methods.some((m) => m.normalizedId === preferred)) return preferred;
    if (isTipIntent(intent) && methods.some((m) => m.normalizedId === 'whop')) return 'whop';
    if (methods.some((m) => m.normalizedId === 'whop')) return 'whop';
    if (methods.some((m) => m.normalizedId === 'paypal')) return 'paypal';
    return methods[0] ? methods[0].normalizedId : '';
  }

  function methodDisplay(normalizedId) {
    if (normalizedId === 'whop') {
      return { label: 'Cards, Apple Pay, Google Pay', note: 'Recommended', icon: '🌐' };
    }
    if (normalizedId === 'paypal') {
      return { label: 'PayPal', note: 'Fast redirect checkout', icon: '🅿️' };
    }
    return { label: normalizedId.toUpperCase(), note: 'Available payment gateway', icon: '💳' };
  }

  function renderMethodPicker(methods) {
    const wrap = document.getElementById('checkout-methods');
    if (!wrap) return;

    if (!methods || methods.length <= 1) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }

    const buttons = methods.map((method) => {
      const display = methodDisplay(method.normalizedId);
      return `
        <button type="button" class="method-btn" data-method="${escapeHtml(method.normalizedId)}">
          <span class="method-icon">${escapeHtml(display.icon)}</span>
          <span class="method-copy">
            <span class="method-title">${escapeHtml(display.label)}</span>
            <span class="method-note">${escapeHtml(display.note)}</span>
          </span>
        </button>
      `;
    }).join('');

    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="method-header">Choose payment method</div>
      <div class="method-grid">${buttons}</div>
    `;

    wrap.querySelectorAll('.method-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const methodId = btn.getAttribute('data-method') || '';
        const intent = window.__checkoutIntentData || null;
        if (!intent || !methodId) return;
        selectMethod(methodId, intent).catch((err) => {
          console.error('Method select error:', err);
          setStatus(extractErrorMessage(err, 'Failed to switch payment method'), 'error');
        });
      });
    });
  }

  function updateMethodSelectionUI(methodId) {
    const wrap = document.getElementById('checkout-methods');
    if (!wrap) return;
    wrap.querySelectorAll('.method-btn').forEach((btn) => {
      const isActive = (btn.getAttribute('data-method') || '') === methodId;
      btn.classList.toggle('active', isActive);
    });
  }

  function formatUsd(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '$0.00';
    return '$' + n.toFixed(2);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isTipIntent(intent) {
    return !!(intent && intent.flowType === 'tip');
  }

  function buildTipReturnUrl(intent, includeSuccess) {
    const orderId = String(intent?.tipOrderId || '').trim();
    const fallback = orderId
      ? `/buyer-order?id=${encodeURIComponent(orderId)}`
      : '/buyer-order';
    const base = String(intent?.tipReturnUrl || fallback).trim() || fallback;

    let parsed;
    try {
      parsed = new URL(base, window.location.origin);
    } catch (e) {
      parsed = new URL(fallback, window.location.origin);
    }

    if (orderId) parsed.searchParams.set('id', orderId);

    if (includeSuccess) {
      parsed.searchParams.set('tip_success', '1');
      const amount = Number(intent?.tipAmount || intent?.amount || 0);
      if (Number.isFinite(amount) && amount > 0) {
        parsed.searchParams.set('tip_amount', amount.toFixed(2));
      }
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  async function confirmTipPaid(intent) {
    if (!isTipIntent(intent)) return;

    const orderId = String(intent.tipOrderId || '').trim();
    const tipAmount = Number(intent.tipAmount || intent.amount || 0);
    if (!orderId || !Number.isFinite(tipAmount) || tipAmount <= 0) return;

    try {
      await fetch('/api/order/tip-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: tipAmount })
      });
    } catch (e) {}
  }

  function renderSummary(intent) {
    const totalEl = document.getElementById('checkout-total');
    if (totalEl) totalEl.textContent = formatUsd(intent.amount);

    const productTitleEl = document.getElementById('checkout-product-title');
    const productThumbEl = document.getElementById('checkout-product-thumb');
    const productPreviewEl = document.getElementById('checkout-product-preview');
    const productTitle = isTipIntent(intent)
      ? `Tip for Order #${intent.tipOrderId || ''}`
      : ((intent.productTitle || '').trim() || `Product #${intent.productId}`);

    if (productTitleEl) productTitleEl.textContent = productTitle;
    if (productPreviewEl) productPreviewEl.hidden = false;

    if (productThumbEl) {
      const thumb = (intent.productThumbnail || '').trim();
      if (thumb) {
        productThumbEl.src = thumb;
        productThumbEl.style.display = '';
      } else {
        productThumbEl.removeAttribute('src');
        productThumbEl.style.display = 'none';
      }
    }

    const metaEl = document.getElementById('checkout-meta');
    if (!metaEl) return;

    const rows = [];
    if (isTipIntent(intent)) {
      rows.push({ label: 'Checkout type', value: 'Tip payment' });
      rows.push({ label: 'Order', value: intent.tipOrderId || 'N/A' });
      if (intent.email) rows.push({ label: 'Email', value: intent.email });
      rows.push({ label: 'Tip amount', value: formatUsd(intent.tipAmount || intent.amount) });
    } else {
      if (intent.email) rows.push({ label: 'Email', value: intent.email });
      if (intent.coupon && intent.coupon.code) rows.push({ label: 'Coupon', value: intent.coupon.code });
      rows.push({ label: 'Add-ons', value: String(Array.isArray(intent.addons) ? intent.addons.length : 0) });
      rows.push({ label: 'Delivery', value: Math.max(1, Math.round((intent.deliveryTimeMinutes || 60) / 60)) + ' hour(s)' });
    }

    metaEl.innerHTML = rows.map((row) => {
      return `<div class="meta-line"><span class="meta-label">${escapeHtml(row.label)}</span><span class="meta-value">${escapeHtml(row.value)}</span></div>`;
    }).join('');

    if (isTipIntent(intent)) {
      setBackLink(buildTipReturnUrl(intent, false));
    } else if (intent.sourceUrl) {
      setBackLink(intent.sourceUrl);
    } else {
      setBackLink(`/product-${encodeURIComponent(intent.productId)}`);
    }
  }

  function serializeWhopMetadata(metadata) {
    const output = {};
    if (!metadata || typeof metadata !== 'object') return output;

    const trimValue = (value, maxLength) => {
      const raw = String(value ?? '');
      if (raw.length <= maxLength) return raw;
      if (maxLength <= 3) return raw.slice(0, Math.max(0, maxLength));
      return `${raw.slice(0, maxLength - 3)}...`;
    };

    const compactAddons = (addons) => {
      if (!Array.isArray(addons) || !addons.length) return '[]';

      const normalized = addons.map((addon, index) => ({
        field: trimValue(addon && addon.field != null ? addon.field : `addon_${index + 1}`, 80),
        value: trimValue(addon && addon.value != null ? addon.value : '', 160)
      }));

      let candidate = normalized.slice(0, WHOP_ADDONS_MAX_ITEMS);
      while (candidate.length > 0) {
        const serialized = JSON.stringify(candidate);
        if (serialized.length <= WHOP_METADATA_SAFE_MAX) {
          return serialized;
        }
        candidate = candidate.slice(0, -1);
      }

      return JSON.stringify([{ field: 'addons_summary', value: `${normalized.length} addon(s) selected` }]);
    };

    Object.keys(metadata).forEach((key) => {
      const rawValue = metadata[key];
      if (rawValue === null || rawValue === undefined) return;

      if (key === 'addons') {
        if (Array.isArray(rawValue)) {
          output[key] = compactAddons(rawValue);
          return;
        }
        if (typeof rawValue === 'string') {
          try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
              output[key] = compactAddons(parsed);
              return;
            }
          } catch (e) {}
        }
      }

      if (typeof rawValue === 'string') {
        output[key] = trimValue(rawValue, WHOP_METADATA_SAFE_MAX);
        return;
      }

      if (typeof rawValue === 'number' || typeof rawValue === 'boolean' || typeof rawValue === 'bigint') {
        output[key] = trimValue(String(rawValue), WHOP_METADATA_SAFE_MAX);
        return;
      }

      try {
        output[key] = trimValue(JSON.stringify(rawValue), WHOP_METADATA_SAFE_MAX);
      } catch (e) {
        output[key] = trimValue(String(rawValue), WHOP_METADATA_SAFE_MAX);
      }
    });

    return output;
  }

  function loadWhopScript() {
    if (window.Whop) return Promise.resolve();
    if (loaderPromise) return loaderPromise;

    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.whop.com/static/checkout/loader.js';
      script.async = true;
      script.onload = () => {
        loaderPromise = null;
        resolve();
      };
      script.onerror = () => {
        loaderPromise = null;
        reject(new Error('Failed to load Whop checkout script'));
      };
      document.head.appendChild(script);
    });

    return loaderPromise;
  }

  async function createCheckoutSession(intent) {
    const isTip = isTipIntent(intent);
    const payloadMetadata = isTip
      ? {
          type: 'tip',
          orderId: intent.tipOrderId,
          tipAmount: Number(intent.tipAmount || intent.amount || 0)
        }
      : {
          addons: intent.addons || [],
          deliveryTimeMinutes: intent.deliveryTimeMinutes || 60,
          couponCode: intent.coupon?.code || ''
        };

    const response = await fetch('/api/whop/create-plan-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: intent.productId,
        amount: intent.amount,
        email: intent.email || '',
        couponCode: isTip ? '' : (intent.coupon?.code || ''),
        deliveryTimeMinutes: intent.deliveryTimeMinutes || 60,
        metadata: payloadMetadata
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const msg = extractErrorMessage(data.error || data.message || data, `Checkout failed (${response.status})`);
      throw new Error(msg);
    }

    if (!data.plan_id) {
      throw new Error('Checkout plan was not generated');
    }

    return data;
  }

  async function createPayPalOrder(intent) {
    const isTip = isTipIntent(intent);
    const payloadMetadata = isTip
      ? {
          type: 'tip',
          orderId: intent.tipOrderId,
          tipAmount: Number(intent.tipAmount || intent.amount || 0)
        }
      : {
          addons: intent.addons || [],
          deliveryTimeMinutes: intent.deliveryTimeMinutes || 60,
          couponCode: intent.coupon?.code || ''
        };

    const response = await fetch('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: intent.productId,
        amount: intent.amount,
        email: intent.email || '',
        couponCode: isTip ? '' : (intent.coupon?.code || ''),
        deliveryTimeMinutes: intent.deliveryTimeMinutes || 60,
        metadata: payloadMetadata
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const msg = extractErrorMessage(data.error || data.message || data, `PayPal checkout failed (${response.status})`);
      throw new Error(msg);
    }

    if (!data.checkout_url) {
      throw new Error('PayPal checkout URL missing');
    }

    return data.checkout_url;
  }

  function showEmbedLoader(text) {
    const container = document.getElementById('checkout-embed');
    if (!container) return;
    container.innerHTML = `
      <div class="loader">
        <div class="spinner" aria-hidden="true"></div>
        <div>${text || 'Loading checkout...'}</div>
      </div>
    `;
  }

  function showPayPalPane(intent) {
    const container = document.getElementById('checkout-embed');
    if (!container) return;

    container.innerHTML = `
      <div class="paypal-pane">
        <div class="paypal-title">Pay with PayPal</div>
        <p class="paypal-note">You will be redirected to PayPal to complete payment securely.</p>
        <button type="button" class="paypal-btn" id="paypal-continue-btn">Continue to PayPal</button>
      </div>
    `;

    const btn = document.getElementById('paypal-continue-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Redirecting...';
      setStatus('Creating PayPal checkout...', 'info');
      try {
        const checkoutUrl = await createPayPalOrder(intent);
        clearIntentStorage();
        window.location.href = checkoutUrl;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = original;
        setStatus(extractErrorMessage(err, 'PayPal checkout failed'), 'error');
      }
    });
  }

  async function mountWhopEmbed(checkoutData, intent) {
    const container = document.getElementById('checkout-embed');
    if (!container) throw new Error('Checkout container not found');

    showEmbedLoader('Loading secure payment form...');

    const embedShell = document.createElement('div');
    embedShell.style.opacity = '0';
    embedShell.style.transition = 'opacity .2s ease';

    const embed = document.createElement('div');
    embed.id = 'whop-embedded-checkout';
    embed.setAttribute('data-whop-checkout-plan-id', checkoutData.plan_id);
    embed.setAttribute('data-whop-checkout-theme', 'light');
    embed.setAttribute('data-whop-checkout-on-complete', 'whopEmbeddedCheckoutComplete');

    if (intent.email) {
      embed.setAttribute('data-whop-checkout-email', intent.email);
    }

    const metadata = serializeWhopMetadata(
      isTipIntent(intent)
        ? {
            product_id: String(intent.productId),
            amount: intent.amount,
            email: intent.email || '',
            type: 'tip',
            orderId: intent.tipOrderId,
            tipAmount: Number(intent.tipAmount || intent.amount || 0)
          }
        : {
            product_id: String(intent.productId),
            amount: intent.amount,
            email: intent.email || '',
            addons: intent.addons || [],
            deliveryTimeMinutes: intent.deliveryTimeMinutes || 60,
            couponCode: intent.coupon?.code || ''
          }
    );
    embed.setAttribute('data-whop-checkout-metadata', JSON.stringify(metadata));

    embedShell.appendChild(embed);
    container.innerHTML = '';
    container.appendChild(embedShell);

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      embedShell.style.opacity = '1';
      setStatus('', 'ok');
    };

    const observer = new MutationObserver(() => {
      if (container.querySelector('iframe')) {
        reveal();
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    window.whopEmbeddedCheckoutComplete = async function(completeData) {
      clearIntentStorage();
      if (isTipIntent(intent)) {
        setStatus('Tip received. Returning to your order...', 'ok');
        await confirmTipPaid(intent);
        window.location.href = buildTipReturnUrl(intent, true);
        return;
      }

      const checkoutId = completeData && completeData.id ? String(completeData.id) : (checkoutData.checkout_id || '');
      const params = new URLSearchParams({
        product: String(intent.productId),
        checkout_id: checkoutId
      });
      window.location.href = `/success.html?${params.toString()}`;
    };

    await loadWhopScript();

    if (container.querySelector('iframe')) {
      reveal();
    }

    setTimeout(() => {
      if (container.querySelector('iframe')) return;
      if (checkoutData.checkout_url) {
        setStatus('Embed is slow to load, redirecting to secure hosted checkout...', 'info');
        window.location.href = checkoutData.checkout_url;
      } else {
        setStatus('Checkout is taking longer than expected. Please refresh the page.', 'error');
      }
    }, 9000);
  }

  async function selectMethod(methodId, intent) {
    const normalized = normalizeMethodId(methodId);
    if (!normalized) return;

    const previous = selectedMethodId;
    selectedMethodId = normalized;
    updateMethodSelectionUI(normalized);

    if (normalized === 'paypal') {
      setStatus('PayPal selected. Continue to PayPal to complete payment.', 'info');
      showPayPalPane(intent);
      return;
    }

    if (normalized === 'whop') {
      const container = document.getElementById('checkout-embed');
      if (previous === 'whop' && container && container.querySelector('iframe')) {
        setStatus('', 'ok');
        return;
      }

      setStatus('Creating your secure checkout session...', 'info');
      const checkoutData = await createCheckoutSession(intent);
      setStatus('Checkout session created. Loading payment form...', 'info');
      await mountWhopEmbed(checkoutData, intent);
      return;
    }

    setStatus('Selected payment gateway is not supported on this page yet.', 'error');
    showEmbedLoader('Please choose another payment method.');
  }

  async function init() {
    setupSummaryDetailsMode();

    const intent = loadIntent();
    if (!intent) {
      clearIntentStorage();
      setStatus('Checkout session missing or expired. Please start again from product page.', 'error');
      setBackLink('/');
      return;
    }

    window.__checkoutIntentData = intent;
    renderSummary(intent);

    fetchProductDetails(intent.productId).then((productInfo) => {
      if (!productInfo) return;
      if (productInfo.title) intent.productTitle = productInfo.title;
      if (productInfo.thumbnail) intent.productThumbnail = productInfo.thumbnail;
      renderSummary(intent);
    }).catch(() => {});

    try {
      setStatus('Loading payment methods...', 'info');
      const methods = await loadPaymentMethods(intent);
      if (!methods.length) {
        throw new Error('No payment methods available');
      }

      renderMethodPicker(methods);
      const defaultMethod = pickDefaultMethod(methods, intent);
      if (!defaultMethod) {
        throw new Error('No supported payment method found');
      }

      await selectMethod(defaultMethod, intent);
    } catch (err) {
      console.error('Checkout page error:', err);
      const message = extractErrorMessage(err, 'Failed to initialize checkout');
      setStatus(message, 'error');
      showEmbedLoader('Could not load checkout. Please go back and try again.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
