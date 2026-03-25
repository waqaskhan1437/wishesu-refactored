/*
 * Whop checkout integration.
 *
 * This module encapsulates loading the Whop checkout loader,
 * determining the correct plan based on price maps, and
 * presenting a modal overlay with an embedded checkout.
 * Updated to SAVE ORDER before redirecting.
 */

;(function(){
  let scriptPromise = null;
  /**
   * Load the Whop checkout loader script.
   * (Fix for: loadWhopScript is not defined)
   */
  function loadWhopScript(opts = {}) {
    if (window.Whop) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.whop.com/static/checkout/loader.js';
      s.async = true;
      s.onload = () => {
        scriptPromise = null;
        resolve();
      };
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load Whop checkout'));
      };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }
  // Yeh variable order ki details store karega taake completion par save kar saken
  let pendingOrderData = null;
  // Backup storage for addons (in case metadata gets lost)
  let savedAddons = [];

  let lastAmount = 0;
  let whopWarmupTriggered = false;

  function formatUSD(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '';
    return `$${n.toFixed(2)}`;
  }

  function parseMap(str) {
    const map = {};
    if (!str || typeof str !== 'string') return map;
    str.split(/[\n,]+/).forEach(item => {
      const parts = item.split('|');
      if (parts.length === 2) {
        const amt = parseFloat(parts[0].trim());
        const plan = parts[1].trim();
        if (!isNaN(amt) && plan) {
          map[amt.toFixed(2)] = plan;
        }
      }
    });
    return map;
  }

  function choosePlan(amount, priceMap, defaultPlan) {
    const amt = parseFloat(amount);
    if (!isNaN(amt)) {
      const keys = Object.keys(priceMap);
      for (const k of keys) {
        const price = parseFloat(k);
        if (Math.abs(price - amt) < 0.01) {
          return priceMap[k];
        }
      }
    }
    return defaultPlan || '';
  }

  /**
   * Defensive cleanup: unlock body scroll and hide overlay.
   */
  function forceCleanup() {
    document.documentElement.classList.remove('whop-open');
    document.body.classList.remove('whop-open');
    const overlay = document.getElementById('whop-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      const c = overlay.querySelector('.whop-container');
      if (c) c.innerHTML = '';
    }
  }

  function ensureOverlay() {
    let overlay = document.getElementById('whop-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'whop-overlay';
      overlay.className = 'whop-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="whop-backdrop"></div>
        <div class="whop-modal">
          <button class="whop-close" type="button" aria-label="Close">×</button>
          <div class="whop-price-header">
            <div class="whop-price-header-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm-2 6V6a2 2 0 114 0v2H8z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="whop-price-header-text">
              <span class="whop-price-title">Secure Checkout</span>
              <span class="whop-price-amount"></span>
            </div>
          </div>
          <div class="whop-container"></div>
          <div class="whop-powered-by">
            <svg class="whop-stripe-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm-2 6V6a2 2 0 114 0v2H8z" clip-rule="evenodd" />
            </svg>
            <span>Secured by <b>Stripe</b></span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => {
        overlay.style.display = 'none';
        // Unlock body scroll - remove from both html and body
        document.documentElement.classList.remove('whop-open');
        document.body.classList.remove('whop-open');
        const c = overlay.querySelector('.whop-container');
        if (c) c.innerHTML = '';
      };

      // Expose a programmatic closer
      window.whopCheckoutClose = close;

      overlay.querySelector('.whop-close').addEventListener('click', close);
      overlay.querySelector('.whop-backdrop').addEventListener('click', close);
    }
    return overlay;
  }

  function updatePriceHeader(overlay, amount) {
    const priceEl = overlay?.querySelector?.('.whop-price-amount');
    if (priceEl) {
      const formatted = formatUSD(amount);
      priceEl.textContent = formatted ? `for ${formatted}` : '';
    }
  }

  /**
   * Handle successful checkout: Save Order -> Redirect
   */
  async function handleComplete(checkoutData) {
    const overlay = document.getElementById('whop-overlay');

    // User ko batayen ke order save ho raha hai
    if (overlay) {
        overlay.innerHTML = '<div style="color:white; font-size:1.5rem; font-weight:bold;">✅ Payment Successful!<br>Saving Order... Please wait.</div>';
    }

    try {
        if (!pendingOrderData) {
            console.error('❌ No pending order data!');
            alert('Payment successful but order data missing. Please contact support.');
            window.location.href = '/';
            return;
        }

        // Get addons from pending order data (already includes photo URLs from checkout.js)

        // Try to get addons from multiple sources (in priority order)
        let addons = [];

        // Source 1: pendingOrderData.metadata.addons
        if (pendingOrderData?.metadata?.addons?.length > 0) {
            addons = pendingOrderData.metadata.addons;
        }
        // Source 2: savedAddons (backup variable)
        else if (savedAddons && savedAddons.length > 0) {
            addons = savedAddons;
        }
                // Source 3: localStorage
        else {
            try {
                const storedData = localStorage.getItem('pendingOrderData');
                if (storedData) {
                    const parsed = JSON.parse(storedData);

                    // Addons (optional)
                    if (Array.isArray(parsed.addons) && parsed.addons.length > 0) {
                        addons = parsed.addons;
                    }

                    // Merge missing basics (even if there are no addons)
                    if (!pendingOrderData) pendingOrderData = {};
                    if (!pendingOrderData.email && parsed.email) pendingOrderData.email = parsed.email;
                    if (!pendingOrderData.amount && parsed.amount) pendingOrderData.amount = parsed.amount;
                    if (!pendingOrderData.productId && parsed.productId) pendingOrderData.productId = parsed.productId;
                    if (!pendingOrderData.deliveryTimeMinutes && parsed.deliveryTimeMinutes) pendingOrderData.deliveryTimeMinutes = parsed.deliveryTimeMinutes;

                    // Clear localStorage after use
                    localStorage.removeItem('pendingOrderData');
                }
            } catch (e) {
            }
        }

        // ✅ FIXED: Use pre-calculated deliveryTimeMinutes from checkout.js
        // This value is already correctly calculated based on product info and addons
        // Formula: instant → 60 min, otherwise → days × 24 × 60
        const deliveryTime = Number(pendingOrderData?.deliveryTimeMinutes || pendingOrderData?.metadata?.deliveryTimeMinutes || 0) || 60;

        // Data prepare karein
        const payload = {
            // Check metadata.product_id (from backend), metadata.productId, or root productId
            productId: pendingOrderData?.metadata?.product_id || pendingOrderData?.metadata?.productId || pendingOrderData?.productId || 1,
            amount: pendingOrderData?.amount || 0,
            email: pendingOrderData?.email || '',
            addons: addons, // Includes photo URLs and form data
            deliveryTime: deliveryTime,
            // Send checkout session ID for idempotency check
            checkoutSessionId: checkoutData?.id || pendingOrderData?.metadata?.checkout_session_id || null
        };

        // Backend API call to save order
        const res = await fetch('/api/order/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        // Success: Redirect DIRECTLY to buyer order page
        if (data && data.orderId) {
            // Direct buyer order page pe redirect
            window.location.href = `/buyer-order?id=${data.orderId}`;
        } else {
            console.warn('⚠️ No order ID in response');
            window.location.href = '/';
        }

    } catch (err) {
        console.error('❌ Order Save Failed:', err);
        alert('Payment successful! Please check your email or contact support with this info: ' + err.message);
        window.location.href = '/';
    }
  }

  /**
   * Main function to open the Whop checkout.
   */
  async function openCheckout(opts = {}) {
    // 1. Store order details for later use in handleComplete
    const mergedEmail = opts.email || window.cachedAddonEmail || '';
    pendingOrderData = Object.assign({}, opts, { email: mergedEmail });

    // Save addons separately as backup
    savedAddons = opts.metadata?.addons || [];

    // Keep the latest calculated total so we can show it on the sticky button.
    lastAmount = Number(opts.amount || 0);

    const overlay = ensureOverlay();

    // Update the price header with current total
    updatePriceHeader(overlay, lastAmount);

    const globals = window.whopSettings || {};

    // Check if planId is directly provided (from dynamic plan creation)
    let selectedPlan = opts.planId || '';

    // If no direct planId, try to find from price maps
    if (!selectedPlan) {
      const prodMapStr = opts.productPriceMap || (window.productData && window.productData.whop_price_map) || '';
      const globalMapStr = globals.price_map || '';
      const priceMap = Object.assign({}, parseMap(globalMapStr), parseMap(prodMapStr));

      const defaultPlan = opts.productPlan || (window.productData && window.productData.whop_plan) || globals.default_plan_id || '';

      selectedPlan = choosePlan(opts.amount || 0, priceMap, defaultPlan);
    }

    if (!selectedPlan) {
      console.error('🔴 NO PLAN ID FOUND!');
      alert('❌ Whop checkout not configured!\n\nNo plan ID found for this product.');
      return;
    }

    const theme = globals.theme || 'light';
    const metadataObj = opts.metadata || {};

    // Email is passed directly to the checkout embed, not metadata.
    // The email is also in `pendingOrderData` for the `handleComplete` function.

    const metadataStr = JSON.stringify(metadataObj);

    // Prepare email attribute for the embed
    const email = pendingOrderData.email || '';
    const emailAttribute = email ? `data-whop-checkout-email="${email}"` : '';

    // Construct the embed HTML with email attribute
    // Use Whop's native submit button for best reliability
    const embed = `<div id="whop-embedded-checkout" data-whop-checkout-plan-id="${selectedPlan}" data-whop-checkout-theme="${theme}" ${emailAttribute} data-whop-checkout-metadata='${metadataStr}' data-whop-checkout-on-complete="whopCheckoutComplete"></div>`;

    const container = overlay.querySelector('.whop-container');
    if (!container) {
      alert('Error: Checkout container not found');
      return;
    }

    container.innerHTML = `
      <div class="whop-inline-loading" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;min-height:260px;color:#6b7280;">
        <div style="width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:whop-spin 0.7s linear infinite;"></div>
        <div style="font-size:14px;">Loading secure checkout...</div>
      </div>
      <div class="whop-embed-shell" style="opacity:0;transition:opacity .2s ease;">
        ${embed}
      </div>
    `;

    const loadingEl = container.querySelector('.whop-inline-loading');
    const embedShell = container.querySelector('.whop-embed-shell');
    let observer = null;
    let loadingTimeout = null;
    let hardTimeout = null;

    const revealCheckout = () => {
      if (embedShell) embedShell.style.opacity = '1';
      if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
      if (observer) observer.disconnect();
      if (loadingTimeout) clearTimeout(loadingTimeout);
      if (hardTimeout) clearTimeout(hardTimeout);
    };

    // Lock body scroll before showing overlay
    document.documentElement.classList.add('whop-open');
    document.body.classList.add('whop-open');

    overlay.style.display = 'flex';

    // Attach completion handler. For tips, callers can pass opts.onComplete
    // so the page can update UI and close the popup without redirecting.
    const userOnComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;
    const isTip = !!(metadataObj && metadataObj.type === 'tip');

    window.whopCheckoutComplete = async (checkoutData) => {
      try {
        if (userOnComplete) {
          await userOnComplete(checkoutData);
          return;
        }

        // Default tip behavior: close the popup and broadcast an event.
        if (isTip) {
          try {
            window.dispatchEvent(new CustomEvent('whopTipPaid', {
              detail: { checkoutData, metadata: metadataObj, amount: opts.amount }
            }));
          } catch (e) {}
          if (typeof window.whopCheckoutClose === 'function') window.whopCheckoutClose();
          return;
        }

        await handleComplete(checkoutData);
      } catch (err) {
        console.error('Whop completion handler error:', err);
        alert('Payment completed, but we could not finish processing. Please contact support.');
        if (typeof window.whopCheckoutClose === 'function') window.whopCheckoutClose();
      }
    };


    try {
      await loadWhopScript();

      // Update price header once after script loads
      updatePriceHeader(overlay, lastAmount);

      // Reveal checkout once Whop iframe is mounted
      observer = new MutationObserver(() => {
        if (container.querySelector('iframe')) {
          revealCheckout();
        }
      });
      observer.observe(container, { childList: true, subtree: true });

      // If iframe is already present (fast path), reveal immediately
      if (container.querySelector('iframe')) {
        revealCheckout();
      }

      // Keep user informed on slow networks instead of showing blank panel
      loadingTimeout = setTimeout(() => {
        if (loadingEl && loadingEl.parentNode) {
          loadingEl.innerHTML = `
            <div style="width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:whop-spin 0.7s linear infinite;"></div>
            <div style="font-size:14px;">Still loading checkout...</div>
          `;
        }
      }, 4000);

      // Hard fallback: if embed still doesn't mount after 7s, try hosted checkout URL
      setTimeout(() => {
        if (container.querySelector('iframe')) return;
        if (opts.checkoutUrl) {
          console.log('🔄 Embedded checkout taking too long, redirecting to hosted checkout...');
          window.location.href = opts.checkoutUrl;
          return;
        }
      }, 7000);

      // Fix B: Hard timeout — if no iframe mounted after 15s and no redirect happened,
      // close the overlay and show error
      hardTimeout = setTimeout(() => {
        if (container.querySelector('iframe')) return;
        // Iframe never mounted — clean up and inform user
        forceCleanup();
        const msg = opts.checkoutUrl 
          ? 'Checkout taking too long to load. Redirecting to secure checkout page...' 
          : 'Checkout could not load. Please try again or refresh the page.';
        
        if (opts.checkoutUrl) {
          window.location.href = opts.checkoutUrl;
        } else {
          alert(msg);
        }
      }, 15000);

    } catch (err) {
      console.error('🔴 FAILED TO LOAD WHOP SCRIPT:', err);
      alert('❌ Failed to load Whop checkout:\n\n' + err.message + '\n\nPlease refresh and try again.');
      forceCleanup();
      if (observer) observer.disconnect();
      if (loadingTimeout) clearTimeout(loadingTimeout);
      if (hardTimeout) clearTimeout(hardTimeout);
    }
  }

  window.whopCheckout = openCheckout;

  // Fix A: Lazy preload — only load Whop script on first user interaction,
  // NOT automatically on DOMContentLoaded. This prevents the SDK from
  // auto-scanning the DOM before any checkout is requested.
  const preload = () => {
    if (whopWarmupTriggered) return;
    whopWarmupTriggered = true;
    loadWhopScript().catch(() => {});
  };

  // Only warm up on first user interaction (pointerdown, touchstart, keydown)
  ['pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, preload, { once: true, passive: true });
  });

  // Expose manual warmup so checkout flows can preload before API response.
  window.whopCheckoutWarmup = preload;
})();
