/*
 * Entry point for the product page.  This script orchestrates
 * fetching product data from the API, updating SEO tags, constructing
 * the page layout and wiring up the price/checkout logic.  It relies
 * on helper functions defined in the product submodules (seo-utils.js,
 * addon-ui.js, layout-main.js, layout-extra.js and checkout.js).
 */

;(function(){
  if (window.__productPageInitBound) return;
  window.__productPageInitBound = true;

  window.basePrice = 0;
  window.currentTotal = 0;
  window.productData = null;

  function readProductBootstrap(expectedId) {
    const el = document.getElementById('product-bootstrap');
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent || '{}');
      const bootId = data && data.product ? data.product.id : null;
      if (expectedId && bootId != null && String(bootId) !== String(expectedId)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function withTimeout(promise, timeoutMs, fallbackValue) {
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
    let done = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        if (arguments.length >= 3) {
          resolve(fallbackValue);
        } else {
          reject(new Error('timeout'));
        }
      }, ms);

      Promise.resolve(promise)
        .then((value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async function getProductWithTimeout(productId, timeoutMs = 12000) {
    if (typeof getProduct !== 'function') {
      throw new Error('getProduct helper is unavailable');
    }
    return withTimeout(getProduct(productId), timeoutMs);
  }

  function loadWhopSettingsNonBlocking(boot) {
    if (boot && boot.whopSettings && typeof boot.whopSettings === 'object') {
      window.whopSettings = boot.whopSettings;
      return;
    }

    const resolver = (typeof window.getWhopSettings === 'function')
      ? window.getWhopSettings()
      : Promise.resolve(null);

    withTimeout(resolver, 2500, null)
      .then((whopResp) => {
        window.whopSettings = whopResp && whopResp.settings ? whopResp.settings : {};
      })
      .catch(() => {
        window.whopSettings = {};
      });
  }

  async function initProductPage() {
    if (window.__productPageInitialized || window.__productPageInitInProgress) return;
    window.__productPageInitInProgress = true;
    try {
      const params = new URLSearchParams(location.search);
      let productId = params.get('id');
      // Canonical URLs are /product-<id>/<slug>. If the worker forgets to
      // inject ?id=, we can still recover the numeric id from the path.
      if (!productId) {
        const m = (location.pathname || '').match(/^\/product-(\d+)\//);
        if (m && m[1]) {
          productId = m[1];
        }
      }

      const container = document.getElementById('product-container');
      if (!container) return;

      if (!productId) {
        container.innerHTML = '<div class="loading-state"><p>Product link is invalid.</p><a href="/" class="btn">Go Home</a></div>';
        window.__productPageInitialized = false;
        return;
      }

      const boot = readProductBootstrap(productId);
      // Do not block rendering on settings API.
      loadWhopSettingsNonBlocking(boot);

      const data = boot || await getProductWithTimeout(productId, 12000);
      const product = data.product;
      const addons = data.addons || product?.addons || [];
      if (!product) {
        container.innerHTML = '<div class="loading-state"><p>Product not found.</p><a href="/" class="btn">Go Home</a></div>';
        window.__productPageInitialized = false;
        return;
      }
      window.productData = product;
      const sale = product.sale_price && parseFloat(product.sale_price) > 0 ? parseFloat(product.sale_price) : null;
      window.basePrice = sale !== null ? sale : parseFloat(product.normal_price || 0);
      window.currentTotal = window.basePrice;
      if (typeof updateSEO === 'function') updateSEO(product);
      const result = window.renderProductMain(container, product, addons);
      window.renderProductDescription(result.wrapper, product);
      if (typeof updateTotal === 'function') updateTotal();
      window.initializePlayer(result.hasVideo);
      window.__productPageInitialized = true;
    } catch (err) {
      window.__productPageInitialized = false;
      const container = document.getElementById('product-container');
      if (container) {
        container.innerHTML = '<div class="loading-state"><p>Error loading product.</p><a href="/" class="btn">Go Home</a></div>';
      }
    } finally {
      window.__productPageInitInProgress = false;
    }
  }

  function scheduleInit() {
    const runInit = () => { initProductPage(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runInit, { once: true });
    } else {
      setTimeout(runInit, 0);
    }
    // BFCache/back-forward navigation safety.
    window.addEventListener('pageshow', runInit);
    // If any late script stalls DOMContentLoaded, retry once after load.
    window.addEventListener('load', () => {
      if (!window.__productPageInitialized && !window.__productPageInitInProgress) {
        runInit();
      }
    }, { once: true });
    // Final guard: avoid permanent skeleton on intermittent script/network issues.
    setTimeout(() => {
      if (!window.__productPageInitialized && !window.__productPageInitInProgress) {
        runInit();
      }
    }, 4000);
  }

  scheduleInit();
})();
