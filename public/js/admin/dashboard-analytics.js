/**
 * Analytics & Verification Admin Panel
 *
 * Allows store owners to configure Google Analytics (GA4), search engine
 * verification codes (Google/Bing), and Facebook Pixel from the dashboard.
 * Settings are saved via the /api/admin/analytics endpoint and injected
 * automatically into your storefront HTML. Based on patterns used by
 * other dashboard modules for a consistent UX.
 */

(function(AD) {
  // Helper: show toast notification
  function toast(msg, ok = true) {
    const el = document.getElementById('analytics-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#10b981' : '#ef4444';
    setTimeout(() => (el.style.display = 'none'), 3000);
  }

  // Fetch helper that wraps fetch with JSON parsing and error handling
  async function jfetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    if (!res.ok) throw new Error('Request failed');
    return res.json();
  }

  /**
   * Render and load the analytics settings page into the provided panel.
   * Fetches existing settings from the backend and populates form fields.
   *
   * @param {HTMLElement} panel The main panel element where content is inserted
   */
  async function loadAnalytics(panel) {
    // Build page HTML
    panel.innerHTML = `
      <div style="max-width:800px;margin:0 auto;padding:20px;">
        <div id="analytics-toast" style="display:none;position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:10px;color:white;font-weight:600;z-index:1000;"></div>
        
        <!-- Header -->
        <div style="margin-bottom:30px;">
          <h2 style="margin:0 0 8px;font-size:28px;color:#1f2937;">📈 Analytics & Verification</h2>
          <p style="margin:0;color:#6b7280;font-size:15px;">Connect Google Analytics, verify your domain with search engines and add social tracking pixels.</p>
        </div>

        <!-- Info Card -->
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #3b82f6;">
          <h3 style="margin:0 0 15px;font-size:18px;color:#1f2937;">ℹ️ Why Add Analytics & Verification?</h3>
          <ul style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.8;">
            <li>Track visits, conversions and user behavior with <strong>Google Analytics</strong>.</li>
            <li>Verify your domain ownership for <strong>Google Search Console</strong> and <strong>Bing Webmaster Tools</strong>.</li>
            <li>Improve ad targeting with the <strong>Facebook Pixel</strong>.</li>
            <li>Scripts are injected automatically and won't slow down your site.</li>
          </ul>
        </div>

        <!-- Form Fields -->
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 20px;font-size:18px;color:#1f2937;">🔧 Settings</h3>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Google Analytics Measurement ID (GA4)</label>
            <input id="ga-id" type="text" placeholder="G-XXXXXXXXXX"
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Starts with G-, from Google Analytics admin &gt; Data Streams.</p>
          </div>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Google Site Verification Code</label>
            <input id="google-verify" type="text" placeholder="abc123..."
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Value of <code>content</code> from the Google Search Console verification meta tag.</p>
          </div>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Bing Site Verification Code</label>
            <input id="bing-verify" type="text" placeholder="ABCDEF123456..."
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Value of <code>content</code> from the Bing Webmaster Tools verification meta tag.</p>
          </div>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Facebook Pixel ID</label>
            <input id="fb-pixel" type="text" placeholder="123456789012345"
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">From your Facebook Events Manager &gt; Pixels.</p>
          </div>

          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Custom Analytics / Tracking Code</label>
            <textarea id="custom-script" placeholder="&lt;script&gt;/* your code here */&lt;/script&gt;"
              style="width:100%;height:140px;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-family:monospace;font-size:14px;line-height:1.4;"></textarea>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Paste any custom HTML/JS snippet (e.g. full Google Analytics tags, Hotjar, etc.). It will be injected into every page.</p>
          </div>
        </div>

        <!-- Save Button -->
        <div style="text-align:center;margin-bottom:40px;">
          <button onclick="AD.saveAnalytics()"
            style="padding:16px 48px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(59,130,246,0.3);">
            💾 Save Settings
          </button>
        </div>

        <!-- Tips -->
        <div style="padding:20px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
          <h4 style="margin:0 0 12px;font-size:16px;color:#1f2937;">✅ Next Steps</h4>
          <ol style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:2;">
            <li>Publish and access your site; view source to confirm tags are injected.</li>
            <li>Add your domain to <strong>Google Search Console</strong> and <strong>Bing Webmaster Tools</strong>, then verify using the meta codes you provided.</li>
            <li>Test your Facebook Pixel using the Facebook Pixel Helper browser extension.</li>
          </ol>
        </div>
      </div>
    `;
    
    // Load existing settings
    try {
      const data = await jfetch('/api/admin/analytics');
      const settings = data.settings || {};
      panel.querySelector('#ga-id').value = settings.ga_id || '';
      panel.querySelector('#google-verify').value = settings.google_verify || '';
      panel.querySelector('#bing-verify').value = settings.bing_verify || '';
      panel.querySelector('#fb-pixel').value = settings.fb_pixel_id || '';
      // Load custom script if present
      if (panel.querySelector('#custom-script')) {
        panel.querySelector('#custom-script').value = settings.custom_script || '';
      }
      toast('✅ Analytics settings loaded', true);
    } catch (e) {
      toast('❌ Failed to load analytics settings', false);
    }
  }

  /**
   * Save analytics settings to the backend. Performs basic trimming and sends
   * a POST request. Shows a success or error toast based on the result.
   */
  async function saveAnalytics() {
    const panel = document.getElementById('main-panel');
    const payload = {
      ga_id: panel.querySelector('#ga-id').value.trim(),
      google_verify: panel.querySelector('#google-verify').value.trim(),
      bing_verify: panel.querySelector('#bing-verify').value.trim(),
      fb_pixel_id: panel.querySelector('#fb-pixel').value.trim(),
      custom_script: panel.querySelector('#custom-script') ? panel.querySelector('#custom-script').value.trim() : ''
    };
    try {
      await jfetch('/api/admin/analytics', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      toast('✅ Analytics settings saved!', true);
    } catch (e) {
      toast('❌ Failed to save settings', false);
    }
  }

  // Export functions to AdminDashboard namespace
  AD.loadAnalytics = loadAnalytics;
  AD.saveAnalytics = saveAnalytics;

})(window.AdminDashboard = window.AdminDashboard || {});