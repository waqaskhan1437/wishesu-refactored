/**
 * Ultra-Simple SEO Panel 2025 - Research-Based Essentials Only
 * Based on Google's official requirements + industry best practices
 * 
 * Core Focus:
 * 1. Page Titles & Descriptions (MUST)
 * 2. Sitemap.xml (MUST)
 * 3. Robots.txt (MUST)
 * 4. Open Graph for Social (RECOMMENDED)
 */

(function(AD) {
  
  function toast(msg, ok=true) {
    const el = document.getElementById('seo-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#10b981' : '#ef4444';
    setTimeout(() => el.style.display = 'none', 3000);
  }

  async function jfetch(url, opts={}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
      ...opts
    });
    if (!res.ok) throw new Error('Request failed');
    return res.json();
  }

  async function loadSEO(panel) {
    panel.innerHTML = `
      <div style="max-width:800px;margin:0 auto;padding:20px;">
        <div id="seo-toast" style="display:none;position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:10px;color:white;font-weight:600;z-index:1000;"></div>
        
        <!-- Header -->
        <div style="margin-bottom:30px;">
          <h2 style="margin:0 0 8px;font-size:28px;color:#1f2937;">🎯 Essential SEO</h2>
          <p style="margin:0;color:#6b7280;font-size:15px;">Core settings based on Google's 2025 requirements</p>
        </div>

        <!-- 1. Site Basics (MUST) -->
        <div style="background:white;border-radius:16px;padding:30px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #ef4444;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <span style="background:#fee2e2;color:#991b1b;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">1</span>
            <h3 style="margin:0;font-size:18px;color:#1f2937;">Site Information (Required)</h3>
          </div>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">
              Site URL *
            </label>
            <input id="site-url" type="url" placeholder="https://prankwish.com" required
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Your primary domain (used in sitemap & meta tags)</p>
          </div>

          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">
              Site Title *
            </label>
            <input id="site-title" type="text" placeholder="Your Store Name" required maxlength="60"
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Max 60 characters (appears in search results)</p>
          </div>

          <div>
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">
              Site Description *
            </label>
            <textarea id="site-desc" placeholder="Brief description of your website..." rows="3" required maxlength="160"
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;resize:vertical;"></textarea>
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
              <p style="margin:0;font-size:13px;color:#6b7280;">Appears in search results</p>
              <span id="desc-count" style="font-size:13px;color:#9ca3af;">0/160</span>
            </div>
          </div>
        </div>

        <!-- 2. Sitemap (MUST) -->
        <div style="background:white;border-radius:16px;padding:30px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #f59e0b;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <span style="background:#fef3c7;color:#92400e;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">2</span>
            <h3 style="margin:0;font-size:18px;color:#1f2937;">XML Sitemap (Google Requirement)</h3>
          </div>
          
          <label style="display:flex;align-items:center;cursor:pointer;margin-bottom:16px;padding:12px;background:#fef3c7;border-radius:8px;">
            <input id="sitemap-on" type="checkbox" style="width:20px;height:20px;margin-right:12px;cursor:pointer;">
            <div>
              <div style="font-weight:600;color:#92400e;">Enable Sitemap</div>
              <div style="font-size:13px;color:#92400e;margin-top:2px;">Auto-generates sitemap.xml for Google</div>
            </div>
          </label>

          <div id="sitemap-info" style="padding:15px;background:#eff6ff;border-radius:10px;display:none;">
            <p style="margin:0 0 12px;font-size:14px;color:#1e40af;font-weight:600;">Your Sitemap URL:</p>
            <div style="display:flex;gap:10px;align-items:center;">
              <code id="sitemap-link" style="flex:1;padding:10px;background:white;border-radius:6px;font-size:14px;color:#3b82f6;word-break:break-all;">https://prankwish.com/sitemap.xml</code>
              <button onclick="window.open(document.getElementById('sitemap-link').textContent, '_blank')" 
                style="padding:10px 16px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;white-space:nowrap;font-weight:600;">
                View
              </button>
            </div>
            <p style="margin:12px 0 0;font-size:12px;color:#3730a3;">
              ⚠️ Submit this URL to <a href="https://search.google.com/search-console" target="_blank" style="color:#2563eb;text-decoration:underline;">Google Search Console</a>
            </p>
          </div>
        </div>

        <!-- 3. Robots.txt (MUST) -->
        <div style="background:white;border-radius:16px;padding:30px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #10b981;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <span style="background:#d1fae5;color:#065f46;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">3</span>
            <h3 style="margin:0;font-size:18px;color:#1f2937;">Robots.txt (Crawl Control)</h3>
          </div>
          
          <label style="display:flex;align-items:center;cursor:pointer;margin-bottom:16px;padding:12px;background:#d1fae5;border-radius:8px;">
            <input id="robots-on" type="checkbox" style="width:20px;height:20px;margin-right:12px;cursor:pointer;">
            <div>
              <div style="font-weight:600;color:#065f46;">Enable Robots.txt</div>
              <div style="font-size:13px;color:#065f46;margin-top:2px;">Auto-protects admin & sensitive pages</div>
            </div>
          </label>

          <div id="robots-info" style="display:none;">
            <div style="padding:15px;background:#fef3c7;border-radius:10px;margin-bottom:15px;">
              <p style="margin:0 0 8px;font-size:14px;color:#92400e;font-weight:600;">🔒 Auto-Blocked:</p>
              <ul style="margin:0;padding-left:20px;color:#92400e;font-size:13px;line-height:1.8;">
                <li>/admin/ - Admin panel</li>
                <li>/api/ - API endpoints</li>
                <li>Order pages (checkout, success)</li>
              </ul>
            </div>

            <div style="padding:15px;background:#eff6ff;border-radius:10px;">
              <p style="margin:0 0 12px;font-size:14px;color:#1e40af;font-weight:600;">Your Robots.txt URL:</p>
              <div style="display:flex;gap:10px;align-items:center;">
                <code id="robots-link" style="flex:1;padding:10px;background:white;border-radius:6px;font-size:14px;color:#3b82f6;">https://prankwish.com/robots.txt</code>
                <button onclick="window.open(document.getElementById('robots-link').textContent, '_blank')" 
                  style="padding:10px 16px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;white-space:nowrap;font-weight:600;">
                  View
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Social Sharing (RECOMMENDED) -->
        <div style="background:white;border-radius:16px;padding:30px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #8b5cf6;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <span style="background:#ede9fe;color:#5b21b6;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">4</span>
            <h3 style="margin:0;font-size:18px;color:#1f2937;">Social Sharing (Optional)</h3>
          </div>
          
          <label style="display:flex;align-items:center;cursor:pointer;margin-bottom:16px;padding:12px;background:#ede9fe;border-radius:8px;">
            <input id="og-on" type="checkbox" style="width:20px;height:20px;margin-right:12px;cursor:pointer;">
            <div>
              <div style="font-weight:600;color:#5b21b6;">Enable Open Graph Tags</div>
              <div style="font-size:13px;color:#5b21b6;margin-top:2px;">Better previews on Facebook, Twitter, WhatsApp</div>
            </div>
          </label>

          <div id="og-image-field" style="display:none;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">
              Default Share Image (Optional)
            </label>
            <input id="og-image" type="url" placeholder="https://prankwish.com/share-image.jpg"
              style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Recommended: 1200x630px (JPG or PNG)</p>
          </div>
        </div>

        <!-- Save Button -->
        <div style="display:flex;gap:12px;justify-content:center;">
          <button onclick="AD.saveMinimalSEO()" 
            style="padding:16px 48px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
            💾 Save SEO Settings
          </button>
        </div>

        <!-- Quick Guide -->
        <div style="margin-top:30px;padding:20px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
          <h4 style="margin:0 0 12px;font-size:16px;color:#1f2937;">✅ Next Steps After Saving</h4>
          <ol style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:2;">
            <li>Submit sitemap.xml to <strong>Google Search Console</strong></li>
            <li>Verify robots.txt is working correctly</li>
            <li>Check meta tags in browser view source</li>
            <li>Test social sharing on Facebook/Twitter</li>
          </ol>
        </div>
      </div>
    `;

    // Character counter
    const descField = panel.querySelector('#site-desc');
    const countSpan = panel.querySelector('#desc-count');
    descField.addEventListener('input', () => {
      countSpan.textContent = descField.value.length + '/160';
      countSpan.style.color = descField.value.length > 160 ? '#ef4444' : '#9ca3af';
    });

    // Toggle visibility
    const sitemapCheck = panel.querySelector('#sitemap-on');
    const sitemapInfo = panel.querySelector('#sitemap-info');
    const robotsCheck = panel.querySelector('#robots-on');
    const robotsInfo = panel.querySelector('#robots-info');
    const ogCheck = panel.querySelector('#og-on');
    const ogImageField = panel.querySelector('#og-image-field');

    sitemapCheck.addEventListener('change', () => {
      sitemapInfo.style.display = sitemapCheck.checked ? 'block' : 'none';
    });

    robotsCheck.addEventListener('change', () => {
      robotsInfo.style.display = robotsCheck.checked ? 'block' : 'none';
    });

    ogCheck.addEventListener('change', () => {
      ogImageField.style.display = ogCheck.checked ? 'block' : 'none';
    });

    // Load settings
    try {
      const data = await jfetch('/api/admin/seo/minimal');
      const s = data.settings || {};
      
      panel.querySelector('#site-url').value = s.site_url || 'https://prankwish.com';
      panel.querySelector('#site-title').value = s.site_title || '';
      panel.querySelector('#site-desc').value = s.site_description || '';
      panel.querySelector('#sitemap-on').checked = s.sitemap_enabled !== 0;
      panel.querySelector('#robots-on').checked = s.robots_enabled !== 0;
      panel.querySelector('#og-on').checked = s.og_enabled !== 0;
      panel.querySelector('#og-image').value = s.og_image || '';

      // Update links
      const baseUrl = s.site_url || 'https://prankwish.com';
      panel.querySelector('#sitemap-link').textContent = baseUrl + '/sitemap.xml';
      panel.querySelector('#robots-link').textContent = baseUrl + '/robots.txt';

      // Trigger visibility
      descField.dispatchEvent(new Event('input'));
      sitemapCheck.dispatchEvent(new Event('change'));
      robotsCheck.dispatchEvent(new Event('change'));
      ogCheck.dispatchEvent(new Event('change'));
      
      toast('✅ SEO settings loaded', true);
    } catch (e) {
      toast('❌ Failed to load settings', false);
    }
  }

  async function saveMinimalSEO() {
    const panel = document.getElementById('main-panel');
    
    const settings = {
      site_url: panel.querySelector('#site-url').value.trim(),
      site_title: panel.querySelector('#site-title').value.trim(),
      site_description: panel.querySelector('#site-desc').value.trim(),
      sitemap_enabled: panel.querySelector('#sitemap-on').checked ? 1 : 0,
      robots_enabled: panel.querySelector('#robots-on').checked ? 1 : 0,
      og_enabled: panel.querySelector('#og-on').checked ? 1 : 0,
      og_image: panel.querySelector('#og-image').value.trim()
    };

    // Validation
    if (!settings.site_url || !settings.site_title || !settings.site_description) {
      toast('❌ Please fill all required fields (marked with *)', false);
      return;
    }

    if (settings.site_description.length > 160) {
      toast('❌ Description must be 160 characters or less', false);
      return;
    }

    try {
      await jfetch('/api/admin/seo/minimal', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      toast('✅ SEO settings saved successfully!', true);
    } catch (e) {
      toast('❌ Failed to save settings', false);
    }
  }

  // Export
  AD.loadSEO = loadSEO;
  AD.saveMinimalSEO = saveMinimalSEO;

})(window.AdminDashboard = window.AdminDashboard || {});
