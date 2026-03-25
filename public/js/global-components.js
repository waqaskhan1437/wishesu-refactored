/**
 * Global Components Injector
 * Automatically injects headers and footers on all pages
 * Also loads site branding (logo, favicon)
 * Respects exclusion settings from admin panel
 */

(function() {
  const STORAGE_KEY = 'siteComponents';
  const BRANDING_KEY = 'siteBranding';
  const BRANDING_CACHE_TTL = 600000; // 10 minutes (reduced API calls)

  function normalizePath(pathname) {
    let p = String(pathname || '/').trim() || '/';
    p = p.replace(/\/+/g, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  function isTransactionalPage(pathname) {
    const p = normalizePath(pathname);
    return (
      p === '/checkout' ||
      p === '/success' ||
      p === '/buyer-order' ||
      p === '/order-detail' ||
      p === '/order-success' ||
      p === '/checkout.html' ||
      p === '/success.html' ||
      p === '/buyer-order.html' ||
      p === '/order-detail.html' ||
      p === '/order-success.html'
    );
  }

  function readProductBootstrap() {
    try {
      const el = document.getElementById('product-bootstrap');
      if (!el) return null;
      const parsed = JSON.parse(el.textContent || '{}');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  const productBootstrap = readProductBootstrap();
  
  // Don't run on admin/transactional pages.
  const currentPath = window.location.pathname || '/';
  if (currentPath.startsWith('/admin') || isTransactionalPage(currentPath)) {
    return;
  }

  function readSsrFlags() {
    const body = document.body;
    const ds = body && body.dataset ? body.dataset : {};
    return {
      enabled: ds.componentsSsr === '1',
      header: ds.globalHeaderSsr === '1',
      footer: ds.globalFooterSsr === '1'
    };
  }

  function hasRenderedHeader() {
    return !!(
      document.querySelector('#global-header') ||
      document.querySelector('.site-header') ||
      document.querySelector('#global-header-slot[data-injected="1"]')
    );
  }

  function hasRenderedFooter() {
    return !!(
      document.querySelector('#global-footer') ||
      document.querySelector('.site-footer') ||
      document.querySelector('#global-footer-slot[data-injected="1"]')
    );
  }

  // Load branding from cache or fetch
  async function loadBranding() {
    try {
      // Step 8: on product page, prefer worker-embedded branding to avoid API call.
      if (
        productBootstrap &&
        productBootstrap.siteBranding &&
        typeof productBootstrap.siteBranding === 'object'
      ) {
        const branding = productBootstrap.siteBranding;
        localStorage.setItem(BRANDING_KEY, JSON.stringify({
          branding,
          timestamp: Date.now()
        }));
        applyBranding(branding);
        return;
      }

      // Check cache
      const cached = localStorage.getItem(BRANDING_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.timestamp && (Date.now() - data.timestamp) < BRANDING_CACHE_TTL) {
          applyBranding(data.branding);
          return;
        }
      }
      
      // Fetch from API
      const res = await fetch('/api/settings/branding');
      const data = await res.json();
      
      if (data.success && data.branding) {
        // Cache it
        localStorage.setItem(BRANDING_KEY, JSON.stringify({
          branding: data.branding,
          timestamp: Date.now()
        }));
        applyBranding(data.branding);
      }
    } catch (e) {
      console.error('Failed to load branding:', e);
    }
  }

  // Apply branding to page
  function applyBranding(branding) {
    if (!branding) return;
    
    // Apply favicon
    if (branding.favicon_url) {
      let link = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
      
      // Also add apple-touch-icon
      let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (!appleIcon) {
        appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleIcon);
      }
      appleIcon.href = branding.favicon_url;
    }
    
    // Replace logo images with custom logo
    if (branding.logo_url) {
      // Replace elements with data-site-logo attribute
      document.querySelectorAll('[data-site-logo]').forEach(el => {
        if (el.tagName === 'IMG') {
          el.src = branding.logo_url;
        } else {
          el.style.backgroundImage = `url(${branding.logo_url})`;
        }
      });
      
      // Store for dynamic use
      window.siteLogo = branding.logo_url;
    }
    
    // Store branding globally for JS access
    window.siteBranding = branding;
  }

  // Load component data
  async function loadData() {
    // Step 8: on product page, prefer worker-embedded components to avoid API call.
    if (
      productBootstrap &&
      productBootstrap.siteComponents &&
      typeof productBootstrap.siteComponents === 'object'
    ) {
      const components = { ...productBootstrap.siteComponents, _timestamp: Date.now() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(components));
      } catch (e) {}
      return components;
    }

    // 1. Try LocalStorage first (fastest)
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // If data is fresh (< 30 minutes), use it immediately
        // Note: _timestamp is added when saving from API
        if (data._timestamp && (Date.now() - data._timestamp) < 1800000) {
          return data;
        }
      }
    } catch (e) {}

    // 2. Fetch from API (if missing or stale)
    try {
      const res = await fetch('/api/settings/components');
      if (res.ok) {
        const json = await res.json();
        if (json.components) {
          // Add timestamp for cache validity
          json.components._timestamp = Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(json.components));
          return json.components;
        }
      }
    } catch (e) {
      console.warn('Components API unavailable, falling back to cache');
    }

    // 3. Fallback to stale LocalStorage data if API failed
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    return null;
  }

  // Check if current page is excluded
  function isExcluded(excludedPages) {
    if (!excludedPages || !excludedPages.length) return false;
    const path = window.location.pathname;
    for (const excluded of excludedPages) {
      if (excluded === path) return true;
      if (excluded.endsWith('/') && path.startsWith(excluded)) return true;
      if (path.startsWith(excluded + '/')) return true;
    }
    return false;
  }

  // Inject header
  function injectHeader(code) {
    if (document.querySelector('.site-header, #global-header')) return;

    // If a page provides a dedicated slot, inject into it instead of inserting a new
    // element at the top of <body>. This avoids layout shifts (CLS) on initial render.
    const slot = document.getElementById('global-header-slot');
    if (slot) {
      if (slot.dataset.injected === '1') return;
      slot.dataset.injected = '1';
      slot.innerHTML = code;
      // Execute scripts if any exist in the header code
      Array.from(slot.querySelectorAll('script')).forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'global-header';
    wrapper.innerHTML = code;
    // Execute scripts if any exist in the header code
    Array.from(wrapper.querySelectorAll('script')).forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });

    if (document.body.firstChild) {
      document.body.insertBefore(wrapper, document.body.firstChild);
    } else {
      document.body.appendChild(wrapper);
    }
  }

  // Inject footer
  function injectFooter(code) {
    if (document.querySelector('.site-footer, #global-footer')) return;

    // Prefer a slot if the page provides one (lets the page reserve space if needed).
    const slot = document.getElementById('global-footer-slot');
    if (slot) {
      if (slot.dataset.injected === '1') return;
      slot.dataset.injected = '1';
      slot.innerHTML = code;
      // Execute scripts if any exist in the footer code
      Array.from(slot.querySelectorAll('script')).forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'global-footer';
    wrapper.innerHTML = code;
    // Execute scripts if any exist in the footer code
    Array.from(wrapper.querySelectorAll('script')).forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    document.body.appendChild(wrapper);
  }

  // Main initialization
  async function init() {
    // Always load branding
    loadBranding();

    const ssr = readSsrFlags();
    const skipHeaderInjection = ssr.header || hasRenderedHeader();
    const skipFooterInjection = ssr.footer || hasRenderedFooter();
    if (skipHeaderInjection && skipFooterInjection) return;

    const data = await loadData();
    if (!data) return;
    if (isExcluded(data.excludedPages)) return;

    // Inject header if enabled
    if (!skipHeaderInjection && data.settings?.enableGlobalHeader !== false && data.defaultHeaderId) {
      const header = (data.headers || []).find(h => h.id === data.defaultHeaderId);
      if (header && header.code) injectHeader(header.code);
    }

    // Inject footer if enabled
    if (!skipFooterInjection && data.settings?.enableGlobalFooter !== false && data.defaultFooterId) {
      const footer = (data.footers || []).find(f => f.id === data.defaultFooterId);
      if (footer && footer.code) injectFooter(footer.code);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 10);
  }
})();
