/**
 * Advanced Dashboard Components - Multiple Headers, Footers, Product/Review lists
 * With code editor, templates, live preview, page exclusion, and proper CRUD
 */

(function(AD) {
  const STORAGE_KEY = 'siteComponents';
  
  // Default component data structure
  function getDefaultData() {
    return {
      headers: [],
      footers: [],
      productLists: [],
      reviewLists: [],
      defaultHeaderId: null,
      defaultFooterId: null,
      excludedPages: [],
      settings: {
        enableGlobalHeader: true,
        enableGlobalFooter: true
      }
    };
  }

  // Load from API (with localStorage fallback)
  async function loadData() {
    try {
      const res = await fetch('/api/settings/components');
      if (res.ok) {
        const json = await res.json();
        if (json.components) {
          console.log('✅ Loaded components from API');
          // Update localStorage to match server
          localStorage.setItem(STORAGE_KEY, JSON.stringify(json.components));
          return { ...getDefaultData(), ...json.components };
        }
      }
    } catch (e) {
      console.error('Failed to load components from API:', e);
    }

    // Fallback to localStorage if API fails or returns null
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('⚠️ Loaded components from localStorage (API fallback)');
        const data = JSON.parse(stored);
        return { ...getDefaultData(), ...data };
      }
    } catch (e) {
      console.error('Failed to load components:', e);
    }
    return getDefaultData();
  }

  // Save to API
  async function saveData(data) {
    try {
      // Save to localStorage immediately (optimistic)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log('✅ Components saved to localStorage');

      // Save to API
      const res = await fetch('/api/settings/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (result.success) {
        console.log('✅ Components saved to API');
        return true;
      } else {
        console.error('Failed to save to API:', result.error);
        alert('⚠️ Saved locally, but failed to save to server: ' + (result.error || 'Unknown error'));
        return false;
      }
    } catch (e) {
      console.error('Failed to save components:', e);
      alert('⚠️ Saved locally, but failed to save to server. Please check your connection.');
      return false;
    }
  }

  // Generate embed code
  function buildProductEmbed(id, options) {
    const END = '</' + 'script>';
    return `<div id="${id}"></div>\n<script defer src="/js/product-cards.js">${END}\n<script>\n(function(){\n  function run(){\n    if (window.ProductCards && typeof window.ProductCards.render === 'function') {\n      window.ProductCards.render('${id}', ${JSON.stringify(options, null, 2)});\n      return;\n    }\n    setTimeout(run, 50);\n  }\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', run);\n  } else {\n    run();\n  }\n})();\n${END}`;
  }

  function buildReviewEmbed(id, options) {
    const END = '</' + 'script>';
    return `<div id="${id}"></div>\n<script defer src="/js/reviews-widget.js">${END}\n<script>\n(function(){\n  function run(){\n    if (window.ReviewsWidget && typeof window.ReviewsWidget.render === 'function') {\n      window.ReviewsWidget.render('${id}', ${JSON.stringify(options, null, 2)});\n      return;\n    }\n    setTimeout(run, 50);\n  }\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', run);\n  } else {\n    run();\n  }\n})();\n${END}`;
  }

  // Header Templates
  const headerTemplates = [
    {
      name: 'Simple Centered',
      code: `<header class="site-header" style="background:#fff;padding:20px 0;border-bottom:1px solid #e5e7eb;">
  <div style="max-width:1200px;margin:0 auto;padding:0 20px;text-align:center;">
    <a href="/" style="font-size:1.8rem;font-weight:800;color:#1f2937;text-decoration:none;">WISHVIDEO</a>
  </div>
</header>`
    },
    {
      name: 'With Navigation',
      code: `<header class="site-header" style="background:#fff;padding:15px 0;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="max-width:1200px;margin:0 auto;padding:0 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;">
    <a href="/" style="font-size:1.5rem;font-weight:800;color:#4f46e5;text-decoration:none;">WISHVIDEO</a>
    <nav style="display:flex;gap:25px;flex-wrap:wrap;">
      <a href="/" style="color:#374151;text-decoration:none;font-weight:500;">Home</a>
      <a href="/products" style="color:#374151;text-decoration:none;font-weight:500;">Products</a>
      <a href="/blog" style="color:#374151;text-decoration:none;font-weight:500;">Blog</a>
      <a href="/forum" style="color:#374151;text-decoration:none;font-weight:500;">Forum</a>
    </nav>
  </div>
</header>`
    },
    {
      name: 'Gradient Hero',
      code: `<header class="site-header" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:60px 20px;text-align:center;color:white;">
  <div style="max-width:800px;margin:0 auto;">
    <h1 style="font-size:2.5rem;margin:0 0 10px;font-weight:800;">Personalized Video Greetings</h1>
    <p style="font-size:1.2rem;opacity:0.9;margin:0;">Make every occasion special with custom video messages</p>
  </div>
</header>`
    },
    {
      name: 'Dark Professional',
      code: `<header class="site-header" style="background:#1f2937;padding:20px 0;">
  <div style="max-width:1200px;margin:0 auto;padding:0 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;">
    <a href="/" style="font-size:1.5rem;font-weight:800;color:#fff;text-decoration:none;">WISHVIDEO</a>
    <nav style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
      <a href="/" style="color:#d1d5db;text-decoration:none;">Home</a>
      <a href="/products" style="color:#d1d5db;text-decoration:none;">Products</a>
      <a href="/products" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Book Now</a>
    </nav>
  </div>
</header>`
    },
    {
      name: 'Sticky Transparent',
      code: `<header class="site-header" style="position:sticky;top:0;background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);padding:15px 0;border-bottom:1px solid rgba(0,0,0,0.1);z-index:1000;">
  <div style="max-width:1200px;margin:0 auto;padding:0 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;">
    <a href="/" style="font-size:1.5rem;font-weight:800;color:#1f2937;text-decoration:none;">WISHVIDEO</a>
    <nav style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
      <a href="/" style="color:#374151;text-decoration:none;font-weight:500;">Home</a>
      <a href="/products" style="color:#374151;text-decoration:none;font-weight:500;">Products</a>
      <a href="/blog" style="color:#374151;text-decoration:none;font-weight:500;">Blog</a>
    </nav>
  </div>
</header>`
    }
  ];

  // Footer Templates
  const footerTemplates = [
    {
      name: 'Simple Copyright',
      code: `<footer class="site-footer" style="background:#f9fafb;padding:30px 20px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="color:#6b7280;margin:0;">&copy; 2025 WishVideo. All rights reserved.</p>
</footer>`
    },
    {
      name: 'With Links',
      code: `<footer class="site-footer" style="background:#1f2937;color:#d1d5db;padding:50px 20px;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px;">
    <div>
      <h4 style="color:#fff;margin:0 0 15px;font-size:1.1rem;">WishVideo</h4>
      <p style="margin:0;font-size:0.9rem;line-height:1.6;">Creating memorable video greetings for your special moments.</p>
    </div>
    <div>
      <h4 style="color:#fff;margin:0 0 15px;font-size:1.1rem;">Quick Links</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <a href="/" style="color:#d1d5db;text-decoration:none;font-size:0.9rem;">Home</a>
        <a href="/products" style="color:#d1d5db;text-decoration:none;font-size:0.9rem;">Products</a>
        <a href="/blog" style="color:#d1d5db;text-decoration:none;font-size:0.9rem;">Blog</a>
      </div>
    </div>
    <div>
      <h4 style="color:#fff;margin:0 0 15px;font-size:1.1rem;">Contact</h4>
      <p style="margin:0;font-size:0.9rem;">support@prankwish.com</p>
    </div>
  </div>
  <div style="max-width:1200px;margin:40px auto 0;padding-top:20px;border-top:1px solid #374151;text-align:center;">
    <p style="margin:0;font-size:0.85rem;">&copy; 2025 WishVideo. All rights reserved.</p>
  </div>
</footer>`
    },
    {
      name: 'Gradient CTA',
      code: `<footer class="site-footer" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 20px;text-align:center;">
  <div style="max-width:800px;margin:0 auto;">
    <h3 style="margin:0 0 10px;font-size:1.5rem;">Ready to create something special?</h3>
    <p style="margin:0 0 20px;opacity:0.9;">Order your personalized video greeting today!</p>
    <a href="/products" style="display:inline-block;background:white;color:#667eea;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:700;">Browse Products</a>
  </div>
  <p style="margin:30px 0 0;font-size:0.85rem;opacity:0.8;">&copy; 2025 WishVideo</p>
</footer>`
    },
    {
      name: 'Modern Minimal',
      code: `<footer class="site-footer" style="background:#fff;padding:40px 20px;border-top:1px solid #e5e7eb;">
  <div style="max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;">
    <div>
      <a href="/" style="font-size:1.3rem;font-weight:800;color:#1f2937;text-decoration:none;">WISHVIDEO</a>
    </div>
    <nav style="display:flex;gap:25px;flex-wrap:wrap;">
      <a href="/" style="color:#6b7280;text-decoration:none;font-size:0.9rem;">Home</a>
      <a href="/products" style="color:#6b7280;text-decoration:none;font-size:0.9rem;">Products</a>
      <a href="/blog" style="color:#6b7280;text-decoration:none;font-size:0.9rem;">Blog</a>
      <a href="/forum" style="color:#6b7280;text-decoration:none;font-size:0.9rem;">Forum</a>
    </nav>
    <p style="margin:0;color:#9ca3af;font-size:0.85rem;">&copy; 2025 WishVideo</p>
  </div>
</footer>`
    }
  ];

  // Common page paths for exclusion
  const commonPages = [
    { path: '/', label: 'Home Page' },
    { path: '/products', label: 'Products' },
    { path: '/product/', label: 'Product Pages (all)' },
    { path: '/blog', label: 'Blog' },
    { path: '/blog/', label: 'Blog Posts (all)' },
    { path: '/forum', label: 'Forum' },
    { path: '/forum/', label: 'Forum Posts (all)' },
    { path: '/admin', label: 'Admin Pages (all)' },
    { path: '/success', label: 'Success Page' },
    { path: '/order', label: 'Order Pages' }
  ];

  AD.loadComponents = async function(panel) {
    let data = await loadData();
    
    panel.innerHTML = `
      <style>
        .comp-container { background: white; border-radius: 12px; overflow: hidden; }
        .comp-header { padding: 25px 30px; border-bottom: 1px solid #e5e7eb; }
        .comp-header h2 { margin: 0 0 5px; font-size: 1.5rem; }
        .comp-header p { margin: 0; color: #6b7280; }
        
        .comp-tabs { display: flex; background: #f9fafb; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
        .comp-tab { padding: 15px 20px; cursor: pointer; border: none; background: none; font-weight: 600; color: #6b7280; transition: all 0.2s; position: relative; white-space: nowrap; }
        .comp-tab:hover { color: #374151; background: #f3f4f6; }
        .comp-tab.active { color: #4f46e5; background: white; }
        .comp-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: #4f46e5; }
        .comp-tab .badge { background: #e5e7eb; color: #374151; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; margin-left: 6px; }
        .comp-tab.active .badge { background: #4f46e5; color: white; }
        
        .comp-content { padding: 25px 30px; display: none; }
        .comp-content.active { display: block; }
        
        .comp-list { display: grid; gap: 15px; }
        .comp-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; transition: all 0.2s; }
        .comp-card:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .comp-card.is-default { border-color: #4f46e5; background: #f5f3ff; }
        .comp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
        .comp-card-title { font-weight: 600; font-size: 1.05rem; color: #1f2937; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .comp-card-title .default-badge { background: #4f46e5; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; }
        .comp-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .comp-card-actions button { padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; cursor: pointer; border: 1px solid #d1d5db; background: white; color: #374151; transition: all 0.15s; }
        .comp-card-actions button:hover { background: #f3f4f6; border-color: #9ca3af; }
        .comp-card-actions button.primary { background: #4f46e5; color: white; border-color: #4f46e5; }
        .comp-card-actions button.primary:hover { background: #4338ca; }
        .comp-card-actions button.danger { color: #dc2626; border-color: #fca5a5; }
        .comp-card-actions button.danger:hover { background: #fef2f2; }
        .comp-card-preview { background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-top: 10px; max-height: 100px; overflow: hidden; position: relative; font-size: 0.8rem; }
        .comp-card-preview::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 30px; background: linear-gradient(transparent, white); }
        .comp-card-meta { display: flex; gap: 15px; margin-top: 10px; font-size: 0.8rem; color: #6b7280; flex-wrap: wrap; }
        
        .editor-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .editor-modal-content { background: white; width: 95%; max-width: 1100px; height: 90vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
        .editor-modal-header { padding: 15px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .editor-modal-header h3 { margin: 0; font-size: 1.2rem; }
        .editor-modal-header .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280; padding: 5px 10px; }
        .editor-modal-body { flex: 1; display: flex; overflow: hidden; }
        .editor-sidebar { width: 250px; background: #f9fafb; border-right: 1px solid #e5e7eb; padding: 15px; overflow-y: auto; flex-shrink: 0; }
        .editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .editor-toolbar { padding: 10px 15px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .editor-toolbar input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; }
        .editor-toolbar input[type="text"] { flex: 1; min-width: 150px; }
        .code-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .code-editor { flex: 1; font-family: 'Monaco', 'Menlo', 'Consolas', monospace; font-size: 13px; line-height: 1.6; padding: 15px; border: none; resize: none; background: #1e1e1e; color: #d4d4d4; }
        .code-editor:focus { outline: none; }
        .preview-toggle { padding: 10px 15px; background: #f3f4f6; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .preview-container { height: 180px; overflow: auto; border-top: 1px solid #e5e7eb; background: white; }
        .preview-frame { width: 100%; height: 100%; border: none; }
        .editor-modal-footer { padding: 15px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
        
        .template-section { margin-bottom: 15px; }
        .template-section h4 { font-size: 0.75rem; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .template-card { background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer; transition: all 0.15s; }
        .template-card:hover { border-color: #4f46e5; background: #f5f3ff; }
        .template-card .name { font-weight: 500; font-size: 0.8rem; color: #374151; }
        
        .empty-state { text-align: center; padding: 50px 20px; color: #6b7280; }
        .empty-state h3 { margin: 0 0 8px; color: #374151; font-size: 1.1rem; }
        .empty-state p { margin: 0 0 15px; font-size: 0.9rem; }
        
        .btn { padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.15s; border: none; }
        .btn-primary { background: #4f46e5; color: white; }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .btn-secondary:hover { background: #e5e7eb; }
        .btn-success { background: #059669; color: white; }
        .btn-success:hover { background: #047857; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-sm { padding: 6px 14px; font-size: 0.85rem; }
        
        .action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
        
        .settings-section { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
        .settings-section h4 { margin: 0 0 15px; font-size: 1rem; color: #1f2937; }
        .settings-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .settings-row:last-child { margin-bottom: 0; }
        .settings-row label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; }
        .toggle-switch { position: relative; width: 44px; height: 24px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #d1d5db; border-radius: 24px; transition: 0.3s; }
        .toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
        .toggle-switch input:checked + .toggle-slider { background: #4f46e5; }
        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
        
        .exclusion-list { max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; background: white; }
        .exclusion-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
        .exclusion-item:last-child { border-bottom: none; }
        .exclusion-item input { margin: 0; }
        
        @media (max-width: 900px) {
          .editor-modal-body { flex-direction: column; }
          .editor-sidebar { width: 100%; max-height: 150px; border-right: none; border-bottom: 1px solid #e5e7eb; }
        }
      </style>

      <div class="comp-container">
        <div class="comp-header">
          <h2>🧩 Component Library</h2>
          <p>Create and manage reusable headers, footers, and components for your website</p>
        </div>

        <div class="comp-tabs">
          <button class="comp-tab active" data-target="headers-tab">📄 Headers <span class="badge" id="headers-count">0</span></button>
          <button class="comp-tab" data-target="footers-tab">📄 Footers <span class="badge" id="footers-count">0</span></button>
          <button class="comp-tab" data-target="settings-tab">⚙️ Settings</button>
          <button class="comp-tab" data-target="products-tab">🛍️ Products <span class="badge" id="products-count">0</span></button>
          <button class="comp-tab" data-target="reviews-tab">⭐ Reviews <span class="badge" id="reviews-count">0</span></button>
        </div>

        <!-- Headers Tab -->
        <div id="headers-tab" class="comp-content active">
          <div class="action-bar">
            <button class="btn btn-primary" id="btn-create-header">+ Create Header</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" id="btn-export-headers">Export</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-headers">Import</button>
            </div>
          </div>
          <div id="headers-list" class="comp-list"></div>
        </div>

        <!-- Footers Tab -->
        <div id="footers-tab" class="comp-content">
          <div class="action-bar">
            <button class="btn btn-primary" id="btn-create-footer">+ Create Footer</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" id="btn-export-footers">Export</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-footers">Import</button>
            </div>
          </div>
          <div id="footers-list" class="comp-list"></div>
        </div>

        <!-- Settings Tab -->
        <div id="settings-tab" class="comp-content">
          <div class="settings-section">
            <h4>🌐 Global Header & Footer</h4>
            <div class="settings-row">
              <label class="toggle-switch">
                <input type="checkbox" id="enable-header" ${data.settings?.enableGlobalHeader !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <span>Enable Global Header on all pages</span>
            </div>
            <div class="settings-row">
              <label class="toggle-switch">
                <input type="checkbox" id="enable-footer" ${data.settings?.enableGlobalFooter !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <span>Enable Global Footer on all pages</span>
            </div>
          </div>

          <div class="settings-section">
            <h4>🚫 Exclude Pages</h4>
            <p style="font-size:0.85rem;color:#6b7280;margin:0 0 15px;">Select pages where header/footer should NOT appear:</p>
            <div class="exclusion-list" id="exclusion-list">
              ${commonPages.map(p => `
                <label class="exclusion-item">
                  <input type="checkbox" value="${p.path}" ${(data.excludedPages || []).includes(p.path) ? 'checked' : ''}>
                  <span><strong>${p.label}</strong> <small style="color:#6b7280;">(${p.path})</small></span>
                </label>
              `).join('')}
            </div>
            <div style="margin-top:15px;">
              <input type="text" id="custom-exclude" placeholder="Add custom path (e.g., /custom-page)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;width:250px;">
              <button class="btn btn-secondary btn-sm" id="btn-add-exclude" style="margin-left:8px;">Add</button>
            </div>
          </div>

          <button class="btn btn-success" id="btn-save-settings">💾 Save Settings</button>
        </div>

        <!-- Products Tab -->
        <div id="products-tab" class="comp-content">
          <div class="action-bar">
            <button class="btn btn-primary" id="btn-create-product">+ Create Product List</button>
          </div>
          <div id="product-lists" class="comp-list"></div>
          <div id="product-preview-area" style="margin-top:20px;display:none;"></div>
        </div>

        <!-- Reviews Tab -->
        <div id="reviews-tab" class="comp-content">
          <div class="action-bar">
            <button class="btn btn-primary" id="btn-create-review">+ Create Review List</button>
          </div>
          <div id="review-lists" class="comp-list"></div>
          <div id="review-preview-area" style="margin-top:20px;display:none;"></div>
        </div>
      </div>
    `;

    // Tab switching
    panel.querySelectorAll('.comp-tab').forEach(tab => {
      tab.onclick = () => {
        panel.querySelectorAll('.comp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        panel.querySelectorAll('.comp-content').forEach(c => c.classList.remove('active'));
        panel.querySelector('#' + tab.dataset.target).classList.add('active');
      };
    });

    // Update counts
    function updateCounts() {
      panel.querySelector('#headers-count').textContent = data.headers?.length || 0;
      panel.querySelector('#footers-count').textContent = data.footers?.length || 0;
      panel.querySelector('#products-count').textContent = data.productLists?.length || 0;
      panel.querySelector('#reviews-count').textContent = data.reviewLists?.length || 0;
    }

    // Render Headers
    function renderHeaders() {
      const container = panel.querySelector('#headers-list');
      const headers = data.headers || [];
      if (!headers.length) {
        container.innerHTML = `<div class="empty-state"><h3>No Headers Yet</h3><p>Create your first header to use across your website</p></div>`;
        return;
      }
      container.innerHTML = headers.map((h, i) => `
        <div class="comp-card ${h.id === data.defaultHeaderId ? 'is-default' : ''}" data-index="${i}">
          <div class="comp-card-header">
            <div class="comp-card-title">
              ${h.name || 'Untitled Header'}
              ${h.id === data.defaultHeaderId ? '<span class="default-badge">ACTIVE</span>' : ''}
            </div>
            <div class="comp-card-actions">
              <button class="btn-edit" data-type="header" data-idx="${i}">Edit</button>
              <button class="btn-preview" data-type="header" data-idx="${i}">Preview</button>
              <button class="btn-copy" data-type="header" data-idx="${i}">Copy</button>
              ${h.id !== data.defaultHeaderId ? `<button class="primary btn-default" data-type="header" data-idx="${i}">Set Active</button>` : ''}
              <button class="danger btn-delete" data-type="header" data-idx="${i}">Delete</button>
            </div>
          </div>
          <div class="comp-card-preview">${escapeHtml(h.code?.substring(0, 200) || '')}</div>
          <div class="comp-card-meta"><span>ID: ${h.id}</span></div>
        </div>
      `).join('');
      attachCardListeners();
    }

    // Render Footers
    function renderFooters() {
      const container = panel.querySelector('#footers-list');
      const footers = data.footers || [];
      if (!footers.length) {
        container.innerHTML = `<div class="empty-state"><h3>No Footers Yet</h3><p>Create your first footer to use across your website</p></div>`;
        return;
      }
      container.innerHTML = footers.map((f, i) => `
        <div class="comp-card ${f.id === data.defaultFooterId ? 'is-default' : ''}" data-index="${i}">
          <div class="comp-card-header">
            <div class="comp-card-title">
              ${f.name || 'Untitled Footer'}
              ${f.id === data.defaultFooterId ? '<span class="default-badge">ACTIVE</span>' : ''}
            </div>
            <div class="comp-card-actions">
              <button class="btn-edit" data-type="footer" data-idx="${i}">Edit</button>
              <button class="btn-preview" data-type="footer" data-idx="${i}">Preview</button>
              <button class="btn-copy" data-type="footer" data-idx="${i}">Copy</button>
              ${f.id !== data.defaultFooterId ? `<button class="primary btn-default" data-type="footer" data-idx="${i}">Set Active</button>` : ''}
              <button class="danger btn-delete" data-type="footer" data-idx="${i}">Delete</button>
            </div>
          </div>
          <div class="comp-card-preview">${escapeHtml(f.code?.substring(0, 200) || '')}</div>
          <div class="comp-card-meta"><span>ID: ${f.id}</span></div>
        </div>
      `).join('');
      attachCardListeners();
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Attach event listeners to card buttons
    function attachCardListeners() {
      // Edit buttons
      panel.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.type;
          const idx = parseInt(btn.dataset.idx);
          const item = type === 'header' ? data.headers[idx] : data.footers[idx];
          openEditorModal(type, item, idx);
        };
      });
      
      // Preview buttons
      panel.querySelectorAll('.btn-preview').forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.type;
          const idx = parseInt(btn.dataset.idx);
          const item = type === 'header' ? data.headers[idx] : data.footers[idx];
          const win = window.open('', '_blank', 'width=1200,height=600');
          win.document.write(`<!DOCTYPE html><html><head><title>${item.name}</title><style>body{margin:0;font-family:system-ui,sans-serif;}</style></head><body>${item.code}</body></html>`);
        };
      });
      
      // Copy buttons
      panel.querySelectorAll('.btn-copy').forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.type;
          const idx = parseInt(btn.dataset.idx);
          const item = type === 'header' ? data.headers[idx] : data.footers[idx];
          navigator.clipboard.writeText(item.code);
          alert('Code copied!');
        };
      });
      
      // Set Default buttons
      panel.querySelectorAll('.btn-default').forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.type;
          const idx = parseInt(btn.dataset.idx);
          if (type === 'header') {
            data.defaultHeaderId = data.headers[idx].id;
            renderHeaders();
          } else {
            data.defaultFooterId = data.footers[idx].id;
            renderFooters();
          }
          saveData(data);
          alert('✅ Active component updated! It will now appear on your website.');
        };
      });
      
      // Delete buttons
      panel.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Are you sure you want to delete this component?')) return;
          const type = btn.dataset.type;
          const idx = parseInt(btn.dataset.idx);
          if (type === 'header') {
            const deleted = data.headers.splice(idx, 1)[0];
            if (deleted.id === data.defaultHeaderId) data.defaultHeaderId = null;
            renderHeaders();
          } else {
            const deleted = data.footers.splice(idx, 1)[0];
            if (deleted.id === data.defaultFooterId) data.defaultFooterId = null;
            renderFooters();
          }
          saveData(data);
          updateCounts();
          alert('✅ Deleted!');
        };
      });
    }

    // Editor Modal
    function openEditorModal(type, item = null, index = null) {
      const isEdit = item !== null;
      const templates = type === 'header' ? headerTemplates : footerTemplates;
      
      // Remove existing modal
      document.querySelectorAll('.editor-modal').forEach(m => m.remove());
      
      const modal = document.createElement('div');
      modal.className = 'editor-modal';
      modal.innerHTML = `
        <div class="editor-modal-content">
          <div class="editor-modal-header">
            <h3>${isEdit ? 'Edit' : 'Create'} ${type === 'header' ? 'Header' : 'Footer'}</h3>
            <button class="close-btn">&times;</button>
          </div>
          <div class="editor-modal-body">
            <div class="editor-sidebar">
              <div class="template-section">
                <h4>📋 Templates</h4>
                ${templates.map((t, i) => `<div class="template-card" data-tpl="${i}"><div class="name">${t.name}</div></div>`).join('')}
              </div>
            </div>
            <div class="editor-main">
              <div class="editor-toolbar">
                <input type="text" id="modal-name" placeholder="Name" value="${item?.name || ''}">
                <input type="text" id="modal-id" placeholder="ID" value="${item?.id || ''}" style="width:120px;" ${isEdit ? 'readonly style="background:#f3f4f6;width:120px;"' : ''}>
              </div>
              <div class="code-area">
                <textarea class="code-editor" id="modal-code" placeholder="Enter HTML code...">${item?.code || ''}</textarea>
              </div>
              <div class="preview-toggle">
                <span style="font-size:0.85rem;color:#6b7280;">Live Preview</span>
                <button class="btn btn-secondary btn-sm" id="btn-toggle-preview">Show Preview</button>
              </div>
              <div class="preview-container" id="modal-preview" style="display:none;">
                <iframe class="preview-frame" id="modal-frame"></iframe>
              </div>
            </div>
          </div>
          <div class="editor-modal-footer">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="modal-set-active" ${!isEdit ? 'checked' : ''}> Set as active ${type}
            </label>
            <div style="display:flex;gap:10px;">
              <button class="btn btn-secondary" id="btn-modal-cancel">Cancel</button>
              <button class="btn btn-success" id="btn-modal-save">💾 Save</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('.close-btn').onclick = closeModal;
      modal.querySelector('#btn-modal-cancel').onclick = closeModal;
      modal.onclick = (e) => { if (e.target === modal) closeModal(); };

      // Templates
      modal.querySelectorAll('.template-card').forEach(card => {
        card.onclick = () => {
          const tpl = templates[parseInt(card.dataset.tpl)];
          modal.querySelector('#modal-code').value = tpl.code;
          if (!modal.querySelector('#modal-name').value) {
            modal.querySelector('#modal-name').value = tpl.name;
          }
          updatePreview();
        };
      });

      // Preview toggle
      let showPreview = false;
      const previewBox = modal.querySelector('#modal-preview');
      const toggleBtn = modal.querySelector('#btn-toggle-preview');
      
      function updatePreview() {
        const frame = modal.querySelector('#modal-frame');
        const doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>body{margin:0;font-family:system-ui,sans-serif;}</style></head><body>${modal.querySelector('#modal-code').value}</body></html>`);
        doc.close();
      }
      
      toggleBtn.onclick = () => {
        showPreview = !showPreview;
        previewBox.style.display = showPreview ? 'block' : 'none';
        toggleBtn.textContent = showPreview ? 'Hide Preview' : 'Show Preview';
        if (showPreview) updatePreview();
      };
      
      modal.querySelector('#modal-code').oninput = () => { if (showPreview) updatePreview(); };

      // Save
      modal.querySelector('#btn-modal-save').onclick = () => {
        const name = modal.querySelector('#modal-name').value.trim() || `${type} ${Date.now()}`;
        const id = modal.querySelector('#modal-id').value.trim() || `${type}-${Date.now()}`;
        const code = modal.querySelector('#modal-code').value;
        const setActive = modal.querySelector('#modal-set-active').checked;

        if (!code.trim()) {
          alert('Please enter HTML code');
          return;
        }

        const newItem = { id, name, code, updatedAt: new Date().toISOString() };

        if (type === 'header') {
          if (!data.headers) data.headers = [];
          if (isEdit && index !== null) {
            data.headers[index] = newItem;
          } else {
            data.headers.push(newItem);
          }
          if (setActive) data.defaultHeaderId = id;
          renderHeaders();
        } else {
          if (!data.footers) data.footers = [];
          if (isEdit && index !== null) {
            data.footers[index] = newItem;
          } else {
            data.footers.push(newItem);
          }
          if (setActive) data.defaultFooterId = id;
          renderFooters();
        }

        saveData(data);
        updateCounts();
        closeModal();
        alert('✅ Saved! The component will now appear on your website.');
      };
    }

    // Create buttons
    panel.querySelector('#btn-create-header').onclick = () => openEditorModal('header');
    panel.querySelector('#btn-create-footer').onclick = () => openEditorModal('footer');

    // Settings save
    panel.querySelector('#btn-save-settings').onclick = () => {
      data.settings = {
        enableGlobalHeader: panel.querySelector('#enable-header').checked,
        enableGlobalFooter: panel.querySelector('#enable-footer').checked
      };
      
      // Collect excluded pages
      const excludedPages = [];
      panel.querySelectorAll('#exclusion-list input:checked').forEach(inp => {
        excludedPages.push(inp.value);
      });
      data.excludedPages = excludedPages;
      
      saveData(data);
      alert('✅ Settings saved!');
    };

    // Add custom exclusion
    panel.querySelector('#btn-add-exclude').onclick = () => {
      const input = panel.querySelector('#custom-exclude');
      const path = input.value.trim();
      if (!path) return;
      if (!path.startsWith('/')) {
        alert('Path must start with /');
        return;
      }
      const list = panel.querySelector('#exclusion-list');
      const item = document.createElement('label');
      item.className = 'exclusion-item';
      item.innerHTML = `<input type="checkbox" value="${path}" checked><span><strong>Custom</strong> <small style="color:#6b7280;">(${path})</small></span>`;
      list.appendChild(item);
      input.value = '';
    };

    // Export/Import
    panel.querySelector('#btn-export-headers').onclick = () => {
      const blob = new Blob([JSON.stringify(data.headers || [], null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'headers.json'; a.click();
    };
    panel.querySelector('#btn-export-footers').onclick = () => {
      const blob = new Blob([JSON.stringify(data.footers || [], null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'footers.json'; a.click();
    };
    panel.querySelector('#btn-import-headers').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async (e) => {
        try {
          const imported = JSON.parse(await e.target.files[0].text());
          if (!Array.isArray(imported)) throw new Error('Invalid format');
          data.headers = [...(data.headers || []), ...imported];
          saveData(data); renderHeaders(); updateCounts();
          alert(`✅ Imported ${imported.length} headers!`);
        } catch(err) { alert('Import failed: ' + err.message); }
      };
      inp.click();
    };
    panel.querySelector('#btn-import-footers').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async (e) => {
        try {
          const imported = JSON.parse(await e.target.files[0].text());
          if (!Array.isArray(imported)) throw new Error('Invalid format');
          data.footers = [...(data.footers || []), ...imported];
          saveData(data); renderFooters(); updateCounts();
          alert(`✅ Imported ${imported.length} footers!`);
        } catch(err) { alert('Import failed: ' + err.message); }
      };
      inp.click();
    };

    // Product Lists
    async function renderProductLists() {
      const container = panel.querySelector('#product-lists');
      const lists = data.productLists || [];
      if (!lists.length) {
        container.innerHTML = `<div class="empty-state"><h3>No Product Lists</h3><p>Create embeddable product grids</p></div>`;
        return;
      }
      container.innerHTML = lists.map((item, i) => `
        <div class="comp-card">
          <div class="comp-card-header">
            <div class="comp-card-title">${item.name || `Product List #${i+1}`}</div>
            <div class="comp-card-actions">
              <button class="btn-pl-edit" data-idx="${i}">Edit</button>
              <button class="btn-pl-preview" data-idx="${i}">Preview</button>
              <button class="btn-pl-copy" data-idx="${i}">Copy Embed</button>
              <button class="danger btn-pl-delete" data-idx="${i}">Delete</button>
            </div>
          </div>
          <div class="comp-card-meta">
            <span>Limit: ${item.options?.limit || 9}</span>
            <span>Cols: ${item.options?.columns || 3}</span>
          </div>
        </div>
      `).join('');
      attachPLListeners();
    }

    function attachPLListeners() {
      panel.querySelectorAll('.btn-pl-edit').forEach(btn => {
        btn.onclick = () => openPLModal(data.productLists[parseInt(btn.dataset.idx)], parseInt(btn.dataset.idx));
      });
      panel.querySelectorAll('.btn-pl-preview').forEach(btn => {
        btn.onclick = () => {
          const item = data.productLists[parseInt(btn.dataset.idx)];
          const area = panel.querySelector('#product-preview-area');
          area.style.display = 'block';
          area.innerHTML = `<div style="background:#f9fafb;padding:20px;border-radius:8px;"><h4 style="margin:0 0 15px;">Preview</h4><div id="${item.id}"></div></div>`;
          if (window.ProductCards) window.ProductCards.render(item.id, item.options);
        };
      });
      panel.querySelectorAll('.btn-pl-copy').forEach(btn => {
        btn.onclick = () => {
          const item = data.productLists[parseInt(btn.dataset.idx)];
          navigator.clipboard.writeText(buildProductEmbed(item.id, item.options));
          alert('Embed code copied!');
        };
      });
      panel.querySelectorAll('.btn-pl-delete').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Delete?')) return;
          data.productLists.splice(parseInt(btn.dataset.idx), 1);
          saveData(data); renderProductLists(); updateCounts();
        };
      });
    }

    async function openPLModal(item = null, index = null) {
      const isEdit = item !== null;
      let products = [];
      try { const r = await fetch('/api/products'); const d = await r.json(); products = d.products || []; } catch(e) {}
      
      document.querySelectorAll('.editor-modal').forEach(m => m.remove());
      const modal = document.createElement('div');
      modal.className = 'editor-modal';
      modal.innerHTML = `
        <div class="editor-modal-content" style="max-width:650px;height:auto;max-height:85vh;">
          <div class="editor-modal-header">
            <h3>${isEdit ? 'Edit' : 'Create'} Product List</h3>
            <button class="close-btn">&times;</button>
          </div>
          <div style="padding:20px;overflow-y:auto;">
            <div style="margin-bottom:15px;">
              <label style="display:block;margin-bottom:5px;font-weight:500;">Name</label>
              <input type="text" id="pl-name" value="${item?.name || ''}" placeholder="My Product List" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-bottom:15px;">
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Filter</label>
                <select id="pl-filter" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                  <option value="all" ${item?.options?.filter === 'all' ? 'selected' : ''}>All</option>
                  <option value="featured" ${item?.options?.filter === 'featured' ? 'selected' : ''}>Featured</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Limit</label>
                <input type="number" id="pl-limit" value="${item?.options?.limit || 9}" min="1" max="50" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Columns</label>
                <select id="pl-cols" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                  <option value="2" ${item?.options?.columns == 2 ? 'selected' : ''}>2</option>
                  <option value="3" ${item?.options?.columns == 3 ? 'selected' : ''}>3</option>
                  <option value="4" ${item?.options?.columns == 4 ? 'selected' : ''}>4</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom:15px;max-height:150px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
              ${products.map(p => `
                <label style="display:flex;align-items:center;gap:8px;padding:5px;cursor:pointer;">
                  <input type="checkbox" name="pl-prods" value="${p.id}" ${item?.options?.ids?.map(String).includes(String(p.id)) ? 'checked' : ''}>
                  <span style="font-size:0.85rem;">${p.title}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="editor-modal-footer">
            <div></div>
            <div style="display:flex;gap:10px;">
              <button class="btn btn-secondary" id="pl-cancel">Cancel</button>
              <button class="btn btn-success" id="pl-save">Save</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('.close-btn').onclick = () => modal.remove();
      modal.querySelector('#pl-cancel').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
      
      modal.querySelector('#pl-save').onclick = () => {
        const ids = [...modal.querySelectorAll('input[name="pl-prods"]:checked')].map(c => c.value);
        const newItem = {
          id: item?.id || `pl-${Date.now()}`,
          name: modal.querySelector('#pl-name').value.trim() || `Product List ${Date.now()}`,
          options: {
            filter: modal.querySelector('#pl-filter').value,
            limit: parseInt(modal.querySelector('#pl-limit').value) || 9,
            columns: parseInt(modal.querySelector('#pl-cols').value) || 3,
            ids: ids.length ? ids : undefined
          }
        };
        if (!data.productLists) data.productLists = [];
        if (isEdit && index !== null) data.productLists[index] = newItem;
        else data.productLists.push(newItem);
        saveData(data); modal.remove(); renderProductLists(); updateCounts();
      };
    }

    // Review Lists
    function renderReviewLists() {
      const container = panel.querySelector('#review-lists');
      const lists = data.reviewLists || [];
      if (!lists.length) {
        container.innerHTML = `<div class="empty-state"><h3>No Review Lists</h3><p>Create embeddable review widgets</p></div>`;
        return;
      }
      container.innerHTML = lists.map((item, i) => `
        <div class="comp-card">
          <div class="comp-card-header">
            <div class="comp-card-title">${item.name || `Review List #${i+1}`}</div>
            <div class="comp-card-actions">
              <button class="btn-rl-edit" data-idx="${i}">Edit</button>
              <button class="btn-rl-preview" data-idx="${i}">Preview</button>
              <button class="btn-rl-copy" data-idx="${i}">Copy Embed</button>
              <button class="danger btn-rl-delete" data-idx="${i}">Delete</button>
            </div>
          </div>
          <div class="comp-card-meta">
            <span>Limit: ${item.options?.limit || 6}</span>
            <span>Cols: ${item.options?.columns || 2}</span>
          </div>
        </div>
      `).join('');
      attachRLListeners();
    }

    function attachRLListeners() {
      panel.querySelectorAll('.btn-rl-edit').forEach(btn => {
        btn.onclick = () => openRLModal(data.reviewLists[parseInt(btn.dataset.idx)], parseInt(btn.dataset.idx));
      });
      panel.querySelectorAll('.btn-rl-preview').forEach(btn => {
        btn.onclick = () => {
          const item = data.reviewLists[parseInt(btn.dataset.idx)];
          const area = panel.querySelector('#review-preview-area');
          area.style.display = 'block';
          area.innerHTML = `<div style="background:#f9fafb;padding:20px;border-radius:8px;"><h4 style="margin:0 0 15px;">Preview</h4><div id="${item.id}"></div></div>`;
          if (window.ReviewsWidget) window.ReviewsWidget.render(item.id, item.options);
        };
      });
      panel.querySelectorAll('.btn-rl-copy').forEach(btn => {
        btn.onclick = () => {
          const item = data.reviewLists[parseInt(btn.dataset.idx)];
          navigator.clipboard.writeText(buildReviewEmbed(item.id, item.options));
          alert('Embed code copied!');
        };
      });
      panel.querySelectorAll('.btn-rl-delete').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Delete?')) return;
          data.reviewLists.splice(parseInt(btn.dataset.idx), 1);
          saveData(data); renderReviewLists(); updateCounts();
        };
      });
    }

    async function openRLModal(item = null, index = null) {
      const isEdit = item !== null;
      let products = [];
      try { const r = await fetch('/api/products'); const d = await r.json(); products = d.products || []; } catch(e) {}
      
      document.querySelectorAll('.editor-modal').forEach(m => m.remove());
      const modal = document.createElement('div');
      modal.className = 'editor-modal';
      modal.innerHTML = `
        <div class="editor-modal-content" style="max-width:500px;height:auto;max-height:85vh;">
          <div class="editor-modal-header">
            <h3>${isEdit ? 'Edit' : 'Create'} Review List</h3>
            <button class="close-btn">&times;</button>
          </div>
          <div style="padding:20px;">
            <div style="margin-bottom:15px;">
              <label style="display:block;margin-bottom:5px;font-weight:500;">Name</label>
              <input type="text" id="rl-name" value="${item?.name || ''}" placeholder="My Review List" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Product</label>
                <select id="rl-prod" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                  <option value="">All</option>
                  ${products.map(p => `<option value="${p.id}" ${item?.options?.productId == p.id ? 'selected' : ''}>${p.title}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Limit</label>
                <input type="number" id="rl-limit" value="${item?.options?.limit || 6}" min="1" max="20" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Columns</label>
                <select id="rl-cols" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                  <option value="1" ${item?.options?.columns == 1 ? 'selected' : ''}>1</option>
                  <option value="2" ${item?.options?.columns == 2 ? 'selected' : ''}>2</option>
                  <option value="3" ${item?.options?.columns == 3 ? 'selected' : ''}>3</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:5px;font-weight:500;">Min Rating</label>
                <select id="rl-rating" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                  <option value="1" ${item?.options?.minRating == 1 ? 'selected' : ''}>1+</option>
                  <option value="4" ${item?.options?.minRating == 4 ? 'selected' : ''}>4+</option>
                  <option value="5" ${item?.options?.minRating == 5 ? 'selected' : ''}>5 only</option>
                </select>
              </div>
            </div>
          </div>
          <div class="editor-modal-footer">
            <div></div>
            <div style="display:flex;gap:10px;">
              <button class="btn btn-secondary" id="rl-cancel">Cancel</button>
              <button class="btn btn-success" id="rl-save">Save</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('.close-btn').onclick = () => modal.remove();
      modal.querySelector('#rl-cancel').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
      
      modal.querySelector('#rl-save').onclick = () => {
        const newItem = {
          id: item?.id || `rl-${Date.now()}`,
          name: modal.querySelector('#rl-name').value.trim() || `Review List ${Date.now()}`,
          options: {
            productId: modal.querySelector('#rl-prod').value || undefined,
            limit: parseInt(modal.querySelector('#rl-limit').value) || 6,
            columns: parseInt(modal.querySelector('#rl-cols').value) || 2,
            minRating: parseInt(modal.querySelector('#rl-rating').value) || 1
          }
        };
        if (!data.reviewLists) data.reviewLists = [];
        if (isEdit && index !== null) data.reviewLists[index] = newItem;
        else data.reviewLists.push(newItem);
        saveData(data); modal.remove(); renderReviewLists(); updateCounts();
      };
    }

    // Create buttons for products/reviews
    panel.querySelector('#btn-create-product').onclick = () => openPLModal();
    panel.querySelector('#btn-create-review').onclick = () => openRLModal();

    // Load scripts for preview
    const loadScript = (src) => new Promise((r) => {
      if (document.querySelector(`script[src="${src}"]`)) { r(); return; }
      const s = document.createElement('script'); s.src = src; s.onload = s.onerror = r; document.body.appendChild(s);
    });
    await loadScript('/js/product-cards.js');
    await loadScript('/js/reviews-widget.js');

    // Initial render
    renderHeaders();
    renderFooters();
    renderProductLists();
    renderReviewLists();
    updateCounts();
  };

  console.log('✅ Dashboard Components loaded');
})(window.AdminDashboard);
