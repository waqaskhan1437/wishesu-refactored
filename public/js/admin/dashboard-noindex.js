/**
 * SEO Visibility Rules Manager
 * - noindex rules: hide from Google
 * - index rules: force-allow index for specific URLs
 */

(function (AD) {
  let currentNoindexRules = [];

  function formatReason(reason) {
    const key = String(reason || '');
    if (key === 'in_sitemap') return 'In sitemap';
    if (key === 'outside_sitemap') return 'Outside sitemap';
    if (key === 'force_index_rule') return 'Force-index rule';
    if (key === 'noindex_rule') return 'Noindex rule';
    if (key === 'sensitive_path') return 'Sensitive path';
    return key || 'detected';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg, ok = true) {
    const el = document.getElementById('seo-rules-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#059669' : '#dc2626';
    setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }

  async function jfetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    if (!res.ok) {
      let msg = 'Request failed';
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function normalizeMode(value) {
    return String(value || '').toLowerCase() === 'index' ? 'index' : 'noindex';
  }

  function isValidRuleInput(value) {
    const raw = String(value || '').trim();
    return raw.startsWith('/') || /^https?:\/\//i.test(raw);
  }

  function renderRulesList(container, rules, mode) {
    const list = Array.isArray(rules) ? rules : [];
    if (list.length === 0) {
      const emptyLabel = mode === 'index'
        ? 'No force-index rules yet.'
        : 'No noindex rules yet.';
      container.innerHTML = `
        <div style="padding:18px;border:1px dashed #d1d5db;border-radius:10px;color:#6b7280;background:#f9fafb;">
          ${emptyLabel}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:grid;gap:10px;">
        ${list.map((rule, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:white;">
            <code style="font-size:13px;color:#111827;word-break:break-all;flex:1;">${escapeHtml(rule)}</code>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${mode === 'noindex'
                ? `<button onclick="AdminDashboard.promoteNoindexRule(${idx})" style="border:0;background:#2563eb;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Index 1-Click</button>`
                : ''
              }
              <button onclick="AdminDashboard.removeNoindexUrl(${idx}, '${mode}')" style="border:0;background:#ef4444;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Remove</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderEffectiveList(container, items, mode) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      container.innerHTML = `
        <div style="padding:14px;border:1px dashed #d1d5db;border-radius:8px;color:#6b7280;background:#f9fafb;">
          No URLs in preview.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:grid;gap:8px;max-height:360px;overflow:auto;padding-right:4px;">
        ${list.map((item) => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;background:#fff;">
            <div style="min-width:0;flex:1;">
              <div style="font-size:12px;color:#111827;word-break:break-all;">${escapeHtml(item.url || '')}</div>
              <div style="margin-top:3px;font-size:11px;color:#6b7280;">${escapeHtml(formatReason(item.reason))} • ${escapeHtml(item.source || 'detected')}</div>
            </div>
            ${mode === 'noindex'
              ? `<button onclick="AdminDashboard.forceIndexUrlFromPreview('${encodeURIComponent(String(item.url || ''))}')" style="border:0;background:#2563eb;color:#fff;padding:5px 8px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">Force Index</button>`
              : ''
            }
          </div>
        `).join('')}
      </div>
    `;
  }

  async function loadRulesLists() {
    const panel = document.getElementById('main-panel');
    if (!panel) return;

    const noindexContainer = panel.querySelector('#seo-noindex-list');
    const indexContainer = panel.querySelector('#seo-index-list');
    const countNoindex = panel.querySelector('#seo-noindex-count');
    const countIndex = panel.querySelector('#seo-index-count');
    const effectiveIndexContainer = panel.querySelector('#seo-effective-index-list');
    const effectiveNoindexContainer = panel.querySelector('#seo-effective-noindex-list');
    const effectiveIndexCount = panel.querySelector('#seo-effective-index-count');
    const effectiveNoindexCount = panel.querySelector('#seo-effective-noindex-count');

    try {
      const data = await jfetch('/api/admin/noindex/list');
      const noindexUrls = Array.isArray(data.noindexUrls) ? data.noindexUrls : (Array.isArray(data.urls) ? data.urls : []);
      const indexUrls = Array.isArray(data.indexUrls) ? data.indexUrls : [];
      const preview = data.preview || {};
      const effectiveIndexed = Array.isArray(preview.indexed) ? preview.indexed : [];
      const effectiveNoindexed = Array.isArray(preview.noindexed) ? preview.noindexed : [];
      currentNoindexRules = noindexUrls.slice();

      renderRulesList(noindexContainer, noindexUrls, 'noindex');
      renderRulesList(indexContainer, indexUrls, 'index');
      renderEffectiveList(effectiveIndexContainer, effectiveIndexed, 'index');
      renderEffectiveList(effectiveNoindexContainer, effectiveNoindexed, 'noindex');

      countNoindex.textContent = String(noindexUrls.length);
      countIndex.textContent = String(indexUrls.length);
      effectiveIndexCount.textContent = `${effectiveIndexed.length}${preview.indexedTotal > effectiveIndexed.length ? ` / ${preview.indexedTotal}` : ''}`;
      effectiveNoindexCount.textContent = `${effectiveNoindexed.length}${preview.noindexedTotal > effectiveNoindexed.length ? ` / ${preview.noindexedTotal}` : ''}`;
    } catch (e) {
      noindexContainer.innerHTML = `<div style="color:#dc2626;">Failed to load rules.</div>`;
      indexContainer.innerHTML = `<div style="color:#dc2626;">Failed to load rules.</div>`;
      if (effectiveIndexContainer) effectiveIndexContainer.innerHTML = `<div style="color:#dc2626;">Failed to load preview.</div>`;
      if (effectiveNoindexContainer) effectiveNoindexContainer.innerHTML = `<div style="color:#dc2626;">Failed to load preview.</div>`;
      countNoindex.textContent = '-';
      countIndex.textContent = '-';
      if (effectiveIndexCount) effectiveIndexCount.textContent = '-';
      if (effectiveNoindexCount) effectiveNoindexCount.textContent = '-';
      toast(e.message || 'Failed to load rules', false);
    }
  }

  async function addNoindexUrl(prefillUrl, prefillMode) {
    const panel = document.getElementById('main-panel');
    if (!panel) return;

    const input = panel.querySelector('#seo-rule-url');
    const modeSelect = panel.querySelector('#seo-rule-mode');

    const mode = normalizeMode(prefillMode || modeSelect.value);
    const rule = String(prefillUrl || input.value || '').trim();

    if (!isValidRuleInput(rule)) {
      toast('Rule must start with "/" or "http:// / https://"', false);
      return;
    }

    try {
      await jfetch('/api/admin/noindex/add', {
        method: 'POST',
        body: JSON.stringify({ url: rule, mode })
      });
      if (!prefillUrl) input.value = '';
      await loadRulesLists();
      toast(mode === 'index' ? 'Force-index rule added' : 'Noindex rule added', true);
    } catch (e) {
      toast(e.message || 'Failed to add rule', false);
    }
  }

  async function removeNoindexUrl(index, mode = 'noindex') {
    const safeMode = normalizeMode(mode);
    try {
      await jfetch('/api/admin/noindex/remove', {
        method: 'POST',
        body: JSON.stringify({ index, mode: safeMode })
      });
      await loadRulesLists();
      toast('Rule removed', true);
    } catch (e) {
      toast(e.message || 'Failed to remove rule', false);
    }
  }

  async function promoteNoindexRule(index) {
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= currentNoindexRules.length) {
      toast('Rule not found', false);
      return;
    }

    const rule = String(currentNoindexRules[idx] || '').trim();
    if (!rule) {
      toast('Rule is empty', false);
      return;
    }

    try {
      // 1) add force-index rule
      await jfetch('/api/admin/noindex/add', {
        method: 'POST',
        body: JSON.stringify({ url: rule, mode: 'index' })
      });

      // 2) remove noindex rule
      await jfetch('/api/admin/noindex/remove', {
        method: 'POST',
        body: JSON.stringify({ index: idx, mode: 'noindex' })
      });

      await loadRulesLists();
      toast('Rule moved to Force Index', true);
    } catch (e) {
      toast(e.message || 'Failed to move rule', false);
    }
  }

  async function forceIndexUrlFromPreview(encodedUrl) {
    let url = '';
    try {
      url = decodeURIComponent(String(encodedUrl || ''));
    } catch (_) {
      url = String(encodedUrl || '');
    }
    url = url.trim();
    if (!url) {
      toast('Invalid URL', false);
      return;
    }
    await addNoindexUrl(url, 'index');
  }

  function bindQuickButtons(panel) {
    panel.querySelectorAll('[data-seo-rule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rule = btn.getAttribute('data-seo-rule') || '';
        const mode = btn.getAttribute('data-seo-mode') || 'noindex';
        addNoindexUrl(rule, mode);
      });
    });
  }

  async function loadNoindex(panel) {
    panel.innerHTML = `
      <div style="max-width:980px;margin:0 auto;padding:20px;">
        <div id="seo-rules-toast" style="display:none;position:fixed;top:20px;right:20px;z-index:9999;padding:12px 18px;border-radius:8px;color:white;font-weight:600;"></div>

        <div style="margin-bottom:20px;">
          <h2 style="margin:0;font-size:28px;color:#111827;">SEO Index / Noindex Rules</h2>
          <p style="margin:8px 0 0;color:#6b7280;">Default behavior: URLs found in sitemap are indexed, URLs outside sitemap are noindexed (unless Force Index rule exists).</p>
        </div>

        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
          <div style="display:grid;grid-template-columns:1fr 140px 120px;gap:10px;align-items:end;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">URL Pattern</label>
              <input id="seo-rule-url" type="text" placeholder="/product-* or https://www.prankwish.com/" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Mode</label>
              <select id="seo-rule-mode" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff;">
                <option value="noindex">Noindex</option>
                <option value="index">Force Index</option>
              </select>
            </div>
            <button onclick="AdminDashboard.addNoindexUrl()" style="height:40px;border:0;background:#2563eb;color:white;border-radius:8px;font-weight:600;cursor:pointer;">Add Rule</button>
          </div>
          <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Accepted formats: relative path (starts with /) or full URL with http/https. Wildcard supported with *.</p>
        </div>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:20px;">
          <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:10px;">Quick actions</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button data-seo-rule="http://www.prankwish.com/*" data-seo-mode="noindex" style="border:1px solid #fca5a5;background:#fff1f2;color:#b91c1c;padding:8px 10px;border-radius:8px;cursor:pointer;">Noindex old www/http URLs</button>
            <button data-seo-rule="/" data-seo-mode="index" style="border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;padding:8px 10px;border-radius:8px;cursor:pointer;">Force index homepage /</button>
            <button data-seo-rule="/product-*" data-seo-mode="noindex" style="border:1px solid #fcd34d;background:#fffbeb;color:#92400e;padding:8px 10px;border-radius:8px;cursor:pointer;">Noindex all products (temporary)</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h3 style="margin:0;font-size:17px;color:#111827;">Noindex Rules</h3>
              <span style="font-size:12px;color:#6b7280;">Count: <strong id="seo-noindex-count">0</strong></span>
            </div>
            <div id="seo-noindex-list"></div>
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h3 style="margin:0;font-size:17px;color:#111827;">Force Index Rules</h3>
              <span style="font-size:12px;color:#6b7280;">Count: <strong id="seo-index-count">0</strong></span>
            </div>
            <div id="seo-index-list"></div>
          </section>
        </div>

        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h3 style="margin:0;font-size:16px;color:#111827;">Effective Indexed (Preview)</h3>
              <span style="font-size:12px;color:#6b7280;">Showing: <strong id="seo-effective-index-count">0</strong></span>
            </div>
            <div id="seo-effective-index-list"></div>
          </section>

          <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h3 style="margin:0;font-size:16px;color:#111827;">Effective Noindexed (Preview)</h3>
              <span style="font-size:12px;color:#6b7280;">Showing: <strong id="seo-effective-noindex-count">0</strong></span>
            </div>
            <div id="seo-effective-noindex-list"></div>
          </section>
        </div>
      </div>
    `;

    bindQuickButtons(panel);
    await loadRulesLists();
  }

  AD.loadNoindex = loadNoindex;
  AD.addNoindexUrl = addNoindexUrl;
  AD.removeNoindexUrl = removeNoindexUrl;
  AD.promoteNoindexRule = promoteNoindexRule;
  AD.forceIndexUrlFromPreview = forceIndexUrlFromPreview;
})(window.AdminDashboard);
