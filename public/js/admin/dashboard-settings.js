/**
 * Clean Settings Panel
 * Includes emergency MP4 upload to R2 with public link history.
 */

(function (AD) {
  let mediaItems = [];
  let showAllMedia = false;

  function toast(msg, ok = true) {
    const el = document.getElementById('settings-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#10b981' : '#ef4444';
    setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }

  async function jfetch(url, opts = {}) {
    const isFormData = opts.body instanceof FormData;
    const headers = { ...(opts.headers || {}) };
    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...opts, headers });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
  }

  function getPanel() {
    return document.getElementById('main-panel');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = n;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatDate(ts) {
    const n = Number(ts || 0);
    if (!n) return 'Unknown time';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return 'Unknown time';
    return d.toLocaleString();
  }

  function updateLastLink(panel) {
    const lastInput = panel.querySelector('#r2-last-link');
    if (!lastInput) return;
    lastInput.value = mediaItems.length ? (mediaItems[0].public_url || '') : '';
  }

  function renderMediaList(panel) {
    const list = panel.querySelector('#r2-media-list');
    if (!list) return;

    if (!mediaItems.length) {
      list.innerHTML = '<div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;color:#6b7280;">No uploaded files yet.</div>';
      return;
    }

    list.innerHTML = mediaItems.map((item) => {
      const id = Number(item.id || 0);
      const name = escapeHtml(item.filename || `video-${id}.mp4`);
      const dateText = escapeHtml(formatDate(item.uploaded_at));
      const sizeText = escapeHtml(formatBytes(item.size_bytes));
      const url = escapeHtml(item.public_url || '#');

      return `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="min-width:220px;flex:1;">
            <div style="font-weight:600;color:#1f2937;word-break:break-word;">${name}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">${dateText} | ${sizeText}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="${url}" target="_blank" rel="noopener"
              style="text-decoration:none;padding:8px 12px;border-radius:8px;border:1px solid #d1d5db;color:#111827;font-weight:600;">
              Open
            </a>
            <button onclick="AD.deleteSettingsMediaFile(${id})"
              style="padding:8px 12px;border:none;border-radius:8px;background:#ef4444;color:white;font-weight:600;cursor:pointer;">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadMediaHistory(panel, silent = true) {
    try {
      const data = await jfetch('/api/admin/settings/media/list');
      mediaItems = Array.isArray(data.items) ? data.items : [];
      updateLastLink(panel);
      renderMediaList(panel);
    } catch (e) {
      mediaItems = [];
      updateLastLink(panel);
      renderMediaList(panel);
      if (!silent) {
        toast(`Failed to load uploads: ${e.message || 'Unknown error'}`, false);
      }
    }
  }

  async function loadSettings(panel) {
    showAllMedia = false;
    mediaItems = [];

    panel.innerHTML = `
      <div style="max-width:900px;margin:0 auto;padding:20px;">
        <div id="settings-toast" style="display:none;position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:10px;color:white;font-weight:600;z-index:1000;"></div>

        <div style="margin-bottom:30px;">
          <h2 style="margin:0 0 8px;font-size:28px;color:#1f2937;">Site Settings</h2>
          <p style="margin:0;color:#6b7280;font-size:15px;">Essential settings for your website</p>
        </div>

        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 20px;font-size:18px;color:#1f2937;">Site Information</h3>

          <div style="display:grid;gap:20px;">
            <div>
              <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Site Title *</label>
              <input id="site-title" type="text" placeholder="Your Store Name" required
                style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
            </div>

            <div>
              <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Site Description *</label>
              <textarea id="site-description" placeholder="Brief description of your website..." rows="3" required
                style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;resize:vertical;"></textarea>
              <div style="display:flex;justify-content:space-between;margin-top:6px;">
                <span style="font-size:13px;color:#6b7280;">Used for search results and social sharing</span>
                <span id="desc-count" style="font-size:13px;color:#9ca3af;">0/160</span>
              </div>
            </div>

            <div>
              <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Admin Email *</label>
              <input id="admin-email" type="email" placeholder="admin@yoursite.com" required
                style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;">
              <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Where you receive order notifications</p>
            </div>
          </div>
        </div>

        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 20px;font-size:18px;color:#1f2937;">Security Settings</h3>

          <div style="display:grid;gap:15px;">
            <label style="display:flex;align-items:center;cursor:pointer;">
              <input id="enable-rate-limit" type="checkbox" style="width:20px;height:20px;margin-right:12px;cursor:pointer;">
              <span style="font-weight:600;color:#374151;">Enable Rate Limiting</span>
            </label>

            <div style="padding-left:32px;">
              <p style="margin:0 0 10px;font-size:14px;color:#4b5563;">Protect against spam and abuse</p>
              <div style="display:flex;gap:15px;align-items:center;">
                <div>
                  <label style="display:block;font-size:13px;color:#374151;margin-bottom:5px;">Requests per minute</label>
                  <input id="rate-limit" type="number" min="1" max="100" value="10"
                    style="padding:8px 12px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;width:120px;">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 10px;font-size:18px;color:#1f2937;">R2 Emergency MP4 Upload</h3>
          <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Upload video to R2 and get direct public link for urgent delivery.</p>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input id="r2-upload-file" type="file" accept=".mp4,video/mp4"
              style="max-width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb;">
            <button id="r2-upload-btn" onclick="AD.uploadSettingsMediaFile()"
              style="padding:10px 14px;border:none;border-radius:10px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">
              Upload MP4
            </button>
          </div>
          <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Allowed type: .mp4 | Max size: 500MB</p>

          <div style="margin-top:16px;">
            <label style="display:block;margin-bottom:8px;font-weight:600;color:#374151;font-size:14px;">Last Link</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <input id="r2-last-link" type="text" readonly placeholder="No upload yet"
                style="flex:1;min-width:260px;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb;font-size:13px;">
              <button onclick="AD.copyLastR2Link()"
                style="padding:10px 14px;border:none;border-radius:10px;background:#111827;color:white;font-weight:600;cursor:pointer;">
                Copy
              </button>
            </div>
          </div>

          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <button id="r2-show-all-btn" onclick="AD.toggleR2MediaList()"
              style="padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:white;color:#111827;font-weight:600;cursor:pointer;">
              Show All
            </button>
            <button onclick="AD.refreshR2MediaList()"
              style="padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:white;color:#111827;font-weight:600;cursor:pointer;">
              Refresh
            </button>
          </div>

          <div id="r2-media-wrap" style="display:none;margin-top:16px;">
            <div id="r2-media-list" style="display:grid;gap:10px;"></div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button onclick="AD.saveCleanSettings()"
            style="padding:14px 32px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
            Save Settings
          </button>
        </div>
      </div>
    `;

    const descField = panel.querySelector('#site-description');
    const countSpan = panel.querySelector('#desc-count');
    const updateCount = () => {
      const len = descField.value.length;
      countSpan.textContent = `${len}/160`;
      countSpan.style.color = len > 160 ? '#ef4444' : '#9ca3af';
    };
    descField.addEventListener('input', updateCount);
    updateCount();

    try {
      const data = await jfetch('/api/admin/settings/clean');
      const s = data.settings || {};

      panel.querySelector('#site-title').value = s.site_title || '';
      panel.querySelector('#site-description').value = s.site_description || '';
      panel.querySelector('#admin-email').value = s.admin_email || '';
      panel.querySelector('#enable-rate-limit').checked = s.enable_rate_limit !== false;
      panel.querySelector('#rate-limit').value = s.rate_limit || 10;

      updateCount();
      toast('Settings loaded', true);
    } catch (e) {
      toast(`Failed to load settings: ${e.message || 'Unknown error'}`, false);
    }

    await loadMediaHistory(panel, true);
  }

  async function saveCleanSettings() {
    const panel = getPanel();
    if (!panel) return;

    const settings = {
      site_title: panel.querySelector('#site-title').value.trim(),
      site_description: panel.querySelector('#site-description').value.trim(),
      admin_email: panel.querySelector('#admin-email').value.trim(),
      enable_rate_limit: panel.querySelector('#enable-rate-limit').checked,
      rate_limit: parseInt(panel.querySelector('#rate-limit').value, 10) || 10
    };

    if (!settings.site_title || !settings.site_description || !settings.admin_email) {
      toast('Please fill all required fields (marked with *)', false);
      return;
    }

    if (settings.site_description.length > 160) {
      toast('Description must be 160 characters or less', false);
      return;
    }

    try {
      await jfetch('/api/admin/settings/clean', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      toast('Settings saved successfully', true);
    } catch (e) {
      toast(`Failed to save settings: ${e.message || 'Unknown error'}`, false);
    }
  }

  async function uploadSettingsMediaFile() {
    const panel = getPanel();
    if (!panel) return;

    const input = panel.querySelector('#r2-upload-file');
    const button = panel.querySelector('#r2-upload-btn');
    const file = input && input.files ? input.files[0] : null;

    if (!file) {
      toast('Please select an MP4 file first', false);
      return;
    }
    if (!/\.mp4$/i.test(String(file.name || ''))) {
      toast('Only .mp4 files are allowed', false);
      return;
    }

    const oldText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Uploading...';
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await jfetch('/api/admin/settings/media/upload', {
        method: 'POST',
        body: formData
      });

      if (input) input.value = '';
      if (data && data.last_link) {
        const lastInput = panel.querySelector('#r2-last-link');
        if (lastInput) lastInput.value = data.last_link;
      }

      await loadMediaHistory(panel, true);
      toast('MP4 uploaded. Public link is ready.', true);
    } catch (e) {
      toast(`Upload failed: ${e.message || 'Unknown error'}`, false);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || 'Upload MP4';
      }
    }
  }

  async function copyLastR2Link() {
    const panel = getPanel();
    if (!panel) return;
    const lastInput = panel.querySelector('#r2-last-link');
    const value = String(lastInput && lastInput.value ? lastInput.value : '').trim();
    if (!value) {
      toast('No link available yet', false);
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (lastInput) {
        lastInput.removeAttribute('readonly');
        lastInput.select();
        document.execCommand('copy');
        lastInput.setAttribute('readonly', 'readonly');
      }
      toast('Link copied', true);
    } catch (_) {
      toast('Could not copy automatically. Please copy manually.', false);
    }
  }

  async function refreshR2MediaList() {
    const panel = getPanel();
    if (!panel) return;
    await loadMediaHistory(panel, false);
  }

  function toggleR2MediaList() {
    const panel = getPanel();
    if (!panel) return;

    showAllMedia = !showAllMedia;
    const wrap = panel.querySelector('#r2-media-wrap');
    const btn = panel.querySelector('#r2-show-all-btn');

    if (wrap) wrap.style.display = showAllMedia ? 'block' : 'none';
    if (btn) btn.textContent = showAllMedia ? 'Hide All' : 'Show All';

    if (showAllMedia) {
      loadMediaHistory(panel, true);
    }
  }

  async function deleteSettingsMediaFile(id) {
    const panel = getPanel();
    if (!panel) return;

    const mediaId = parseInt(String(id || ''), 10);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return;

    if (!window.confirm('Delete this uploaded file from R2 and history?')) return;

    try {
      await jfetch(`/api/admin/settings/media/delete?id=${encodeURIComponent(mediaId)}`, {
        method: 'DELETE'
      });
      await loadMediaHistory(panel, true);
      toast('Upload deleted', true);
    } catch (e) {
      toast(`Delete failed: ${e.message || 'Unknown error'}`, false);
    }
  }

  AD.loadSettings = loadSettings;
  AD.saveCleanSettings = saveCleanSettings;
  AD.uploadSettingsMediaFile = uploadSettingsMediaFile;
  AD.copyLastR2Link = copyLastR2Link;
  AD.refreshR2MediaList = refreshR2MediaList;
  AD.toggleR2MediaList = toggleR2MediaList;
  AD.deleteSettingsMediaFile = deleteSettingsMediaFile;
})(window.AdminDashboard);
