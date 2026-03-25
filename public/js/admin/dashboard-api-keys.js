/**
 * Dashboard API Keys - Admin UI for managing API keys
 */

(function (AD) {
  const state = {
    apiKeys: [],
    permissionsByResource: null,
    editingId: null
  };

  AD.loadApiKeys = async function (panel) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <h2 style="margin:0;color:#111827;">🔑 API Keys</h2>
          <div style="margin-top:6px;color:#6b7280;max-width:760px;line-height:1.4;">
            Create keys for integrations. The full key is shown only once, right after you create it.
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn" id="ak-refresh" style="background:#6b7280;color:white;">Refresh</button>
        </div>
      </div>

      <div id="ak-alert" style="display:none;margin-bottom:12px;padding:12px 14px;border-radius:10px;border:1px solid #fee2e2;background:#fff1f2;color:#991b1b;font-weight:700;"></div>

      <div class="stats-grid" style="margin-bottom: 18px;">
        <div class="stat-card">
          <div class="stat-value" id="ak-stat-total">-</div>
          <div class="stat-label">Total Keys</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ak-stat-enabled">-</div>
          <div class="stat-label">Enabled</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ak-stat-requests">-</div>
          <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="ak-stat-lastused">-</div>
          <div class="stat-label">Last Used</div>
        </div>
      </div>

      <div style="background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:18px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
          <h3 style="margin:0;color:#111827;" id="ak-form-title">Create API Key</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <label style="display:flex;gap:10px;align-items:center;font-weight:800;color:#111827;">
              <input type="checkbox" id="ak-is-active" checked>
              Enabled
            </label>
            <button class="btn" id="ak-cancel-edit" style="display:none;background:#6b7280;color:white;">Cancel Edit</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-top:12px;">
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Name</label>
            <input id="ak-name" type="text" placeholder="e.g. Zapier, Mobile App" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;outline:none;">
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Expires in (days)</label>
            <input id="ak-expires" type="number" min="0" placeholder="0 = never" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;outline:none;">
            <div style="margin-top:6px;color:#6b7280;font-size:12px;">Only used when creating a key.</div>
          </div>
        </div>

        <div style="margin-top:12px;">
          <label style="display:flex;gap:10px;align-items:center;font-weight:800;color:#111827;margin-bottom:8px;">
            <input type="checkbox" id="ak-perm-all">
            All permissions ( <span style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#111827;color:#e5e7eb;padding:2px 6px;border-radius:6px;font-size:12px;">*</span> )
          </label>

          <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Permissions</label>
          <select id="ak-perms" multiple size="12" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px;font-size:13px;outline:none;"></select>
          <div style="margin-top:8px;color:#6b7280;font-size:12px;line-height:1.4;">
            Hold Ctrl/Cmd to select multiple. Use minimal permissions for security.
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px;">
          <button class="btn btn-primary" id="ak-save">Create Key</button>
        </div>

        <div id="ak-created-wrap" style="display:none;margin-top:14px;border:1px solid #a5f3fc;background:#ecfeff;border-radius:12px;padding:14px;">
          <div style="font-weight:900;color:#0e7490;margin-bottom:6px;">Save this key now</div>
          <div style="color:#0e7490;font-size:12px;margin-bottom:10px;">This is the only time the full key will be shown.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <textarea id="ak-created-key" readonly rows="2" style="flex:1;min-width:260px;padding:10px 12px;border:1px solid #67e8f9;border-radius:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;"></textarea>
            <button class="btn btn-primary" id="ak-copy-created">Copy</button>
          </div>
          <div style="margin-top:10px;color:#0e7490;font-size:12px;line-height:1.6;">
            Use as: <span style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#111827;color:#e5e7eb;padding:2px 6px;border-radius:6px;">Authorization: Bearer &lt;key&gt;</span>
            or <span style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#111827;color:#e5e7eb;padding:2px 6px;border-radius:6px;">X-API-Key: &lt;key&gt;</span>
          </div>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th style="text-align:center;">Status</th>
              <th>Permissions</th>
              <th style="text-align:center;">Requests</th>
              <th>Last Used</th>
              <th>Expires</th>
              <th>Created</th>
              <th style="width:260px;">Actions</th>
            </tr>
          </thead>
          <tbody id="ak-tbody"></tbody>
        </table>
      </div>

      <div id="ak-empty" style="display:none;margin-top:14px;background:white;border-radius:12px;padding:18px;border:1px solid #e5e7eb;color:#6b7280;">
        No API keys yet.
      </div>

      <div id="ak-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center;padding:18px;">
        <div style="background:white;border-radius:12px;width:100%;max-width:980px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
          <div style="padding:14px 16px;background:linear-gradient(135deg,#111827 0%,#374151 100%);color:white;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:900;" id="ak-modal-title">Details</div>
            <button class="btn" id="ak-modal-close" style="background:rgba(255,255,255,0.15);color:white;">Close</button>
          </div>
          <div style="padding:16px;overflow:auto;" id="ak-modal-body"></div>
        </div>
      </div>
    `;

    bind(panel);
    await loadPermissions(panel);
    await refresh(panel);
  };

  function bind(panel) {
    panel.querySelector('#ak-refresh')?.addEventListener('click', () => refresh(panel));

    panel.querySelector('#ak-perm-all')?.addEventListener('change', () => {
      const all = panel.querySelector('#ak-perm-all')?.checked;
      const select = panel.querySelector('#ak-perms');
      if (select) select.disabled = Boolean(all);
    });

    panel.querySelector('#ak-cancel-edit')?.addEventListener('click', () => setEditMode(panel, null));

    panel.querySelector('#ak-save')?.addEventListener('click', async () => {
      try {
        await saveForm(panel);
      } catch (err) {
        showAlert(panel, err.message || 'Save failed');
      }
    });

    panel.querySelector('#ak-copy-created')?.addEventListener('click', async () => {
      const key = panel.querySelector('#ak-created-key')?.value || '';
      await copyToClipboard(key, panel);
    });

    panel.querySelector('#ak-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;

      try {
        if (action === 'edit') {
          const key = state.apiKeys.find((k) => String(k.id) === String(id));
          setEditMode(panel, key || null);
        }

        if (action === 'toggle') {
          await apiJson(`/api/admin/api-keys/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: !btn.dataset.active || btn.dataset.active !== 'true' })
          });
          await refresh(panel);
        }

        if (action === 'delete') {
          if (!confirm('Delete this API key? This cannot be undone.')) return;
          await apiJson(`/api/admin/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await refresh(panel);
        }

        if (action === 'details') {
          await showDetails(panel, id);
        }

        if (action === 'test') {
          await testApiKey(panel, id);
        }
      } catch (err) {
        showAlert(panel, err.message || 'Action failed');
      }
    });

    panel.querySelector('#ak-modal-close')?.addEventListener('click', () => closeModal(panel));
    panel.querySelector('#ak-modal')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'ak-modal') closeModal(panel);
    });
  }

  async function saveForm(panel) {
    const name = (panel.querySelector('#ak-name')?.value || '').trim();
    const expiresRaw = (panel.querySelector('#ak-expires')?.value || '').trim();
    const isActive = Boolean(panel.querySelector('#ak-is-active')?.checked);
    const permissions = getSelectedPermissions(panel);

    if (!name) throw new Error('Name is required');
    if (!permissions.length) throw new Error('Select at least one permission');

    const createdWrap = panel.querySelector('#ak-created-wrap');
    if (createdWrap) createdWrap.style.display = 'none';

    if (!state.editingId) {
      const expiresInDays = expiresRaw ? Number(expiresRaw) : 0;
      if (!Number.isFinite(expiresInDays) || expiresInDays < 0) throw new Error('Expiry must be 0 or greater');

      const resp = await apiJson('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, permissions, expiresInDays })
      });

      const keyValue = resp?.apiKey?.key;
      if (keyValue) {
        panel.querySelector('#ak-created-key').value = keyValue;
        panel.querySelector('#ak-created-wrap').style.display = 'block';
      }

      setEditMode(panel, null);
      await refresh(panel);
      return;
    }

    await apiJson(`/api/admin/api-keys/${encodeURIComponent(state.editingId)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, permissions, isActive })
    });

    setEditMode(panel, null);
    await refresh(panel);
  }

  function setEditMode(panel, key) {
    state.editingId = key ? String(key.id) : null;

    panel.querySelector('#ak-form-title').textContent = key ? `Edit API Key (#${key.id})` : 'Create API Key';
    panel.querySelector('#ak-save').textContent = key ? 'Save Changes' : 'Create Key';
    panel.querySelector('#ak-cancel-edit').style.display = key ? 'inline-block' : 'none';

    panel.querySelector('#ak-name').value = key ? key.name || '' : '';
    panel.querySelector('#ak-is-active').checked = key ? Boolean(key.isActive) : true;

    const expiresInput = panel.querySelector('#ak-expires');
    if (expiresInput) {
      expiresInput.value = '';
      expiresInput.disabled = Boolean(key);
    }

    const allPerms = panel.querySelector('#ak-perm-all');
    if (allPerms) allPerms.checked = Boolean(key && Array.isArray(key.permissions) && key.permissions.includes('*'));
    const select = panel.querySelector('#ak-perms');
    if (select) select.disabled = Boolean(allPerms && allPerms.checked);

    if (select) {
      const selected = new Set(Array.isArray(key?.permissions) ? key.permissions : []);
      Array.from(select.options).forEach((opt) => {
        opt.selected = selected.has(opt.value);
      });
    }
  }

  function getSelectedPermissions(panel) {
    if (panel.querySelector('#ak-perm-all')?.checked) return ['*'];
    const select = panel.querySelector('#ak-perms');
    if (!select) return [];
    return Array.from(select.selectedOptions).map((o) => o.value).filter(Boolean);
  }

  async function loadPermissions(panel) {
    if (state.permissionsByResource) return;
    const resp = await apiJson('/api/admin/api-keys/permissions');
    state.permissionsByResource = resp?.permissions || {};

    const select = panel.querySelector('#ak-perms');
    if (!select) return;

    const groups = state.permissionsByResource;
    const resources = Object.keys(groups).sort();
    select.innerHTML = resources
      .map((resource) => {
        const perms = Array.isArray(groups[resource]) ? groups[resource] : [];
        const opts = perms
          .map((p) => {
            const perm = p.permission || '';
            const label = p.label || perm;
            return `<option value="${escapeHtml(perm)}">${escapeHtml(label)} (${escapeHtml(perm)})</option>`;
          })
          .join('');
        return `<optgroup label="${escapeHtml(resource)}">${opts}</optgroup>`;
      })
      .join('');
  }

  async function refresh(panel) {
    const data = await apiJson('/api/admin/api-keys');
    state.apiKeys = data?.apiKeys || [];
    render(panel);
  }

  function render(panel) {
    const keys = state.apiKeys || [];
    const total = keys.length;
    const enabled = keys.filter((k) => k && k.isActive).length;
    const totalRequests = keys.reduce((sum, k) => sum + (Number(k.usageCount) || 0), 0);
    const latestUsed = keys
      .map((k) => toDate(k && k.lastUsedAt))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    setText(panel, '#ak-stat-total', String(total));
    setText(panel, '#ak-stat-enabled', String(enabled));
    setText(panel, '#ak-stat-requests', String(totalRequests));
    setText(panel, '#ak-stat-lastused', latestUsed ? formatDateTime(latestUsed) : '-');

    const tbody = panel.querySelector('#ak-tbody');
    const empty = panel.querySelector('#ak-empty');
    if (!tbody || !empty) return;

    if (total === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = keys
      .map((k) => {
        const perms = Array.isArray(k.permissions) ? k.permissions : [];
        const permSummary = perms.includes('*')
          ? 'All (*)'
          : perms.length
            ? `${perms.length} permissions`
            : 'None';

        const status = k.isActive
          ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:700;">Enabled</span>`
          : `<span style="background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:700;">Disabled</span>`;

        return `
          <tr>
            <td style="font-weight:800;color:#111827;">${escapeHtml(k.name || '')}</td>
            <td style="text-align:center;">${status}</td>
            <td style="color:#111827;font-weight:700;">${escapeHtml(permSummary)}</td>
            <td style="text-align:center;font-weight:800;color:#111827;">${Number(k.usageCount) || 0}</td>
            <td>${escapeHtml(k.lastUsedAt ? formatDateTime(toDate(k.lastUsedAt)) : '-')}</td>
            <td>${escapeHtml(k.expiresAt ? formatDateTime(toDate(k.expiresAt)) : 'Never')}</td>
            <td>${escapeHtml(k.createdAt ? formatDateTime(toDate(k.createdAt)) : '-')}</td>
            <td>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary" data-action="details" data-id="${k.id}">Details</button>
                <button class="btn" style="background:#8b5cf6;color:white;" data-action="test" data-id="${k.id}">Test Key</button>
                <button class="btn" style="background:#6b7280;color:white;" data-action="edit" data-id="${k.id}">Edit</button>
                <button class="btn" style="background:${k.isActive ? '#f59e0b' : '#16a34a'};color:white;"
                  data-action="toggle" data-id="${k.id}" data-active="${k.isActive ? 'true' : 'false'}">
                  ${k.isActive ? 'Disable' : 'Enable'}
                </button>
                <button class="btn" style="background:#ef4444;color:white;" data-action="delete" data-id="${k.id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function testApiKey(panel, id) {
    const btn = panel.querySelector(`button[data-action="test"][data-id="${id}"]`);
    const originalText = btn.textContent;
    btn.textContent = '⏳ Testing...';
    btn.disabled = true;

    try {
      // Use the dedicated ping endpoint
      const resp = await apiJson('/api/admin/api-keys/ping');
      if (resp && resp.success) {
        alert('✅ API Key Test Successful!\n\nServer responded: ' + resp.message);
      } else {
        alert('⚠️ API Key Test: Server responded but success was false.');
      }
    } catch (err) {
      alert('❌ API Key Test Failed!\n\nError: ' + err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async function showDetails(panel, id) {
    const data = await apiJson(`/api/admin/api-keys/${encodeURIComponent(id)}`);
    const key = data?.apiKey;
    if (!key) throw new Error('API key not found');

    const stats = key.stats || {};
    const recent = Array.isArray(key.recentUsage) ? key.recentUsage : [];
    const perms = Array.isArray(key.permissions) ? key.permissions : [];

    panel.querySelector('#ak-modal-title').textContent = `API Key Details (#${key.id})`;
    panel.querySelector('#ak-modal-body').innerHTML = `
      <div style="font-weight:900;font-size:18px;color:#111827;">${escapeHtml(key.name || '')}</div>
      <div style="margin-top:6px;color:#6b7280;font-size:12px;">Status: <strong>${key.isActive ? 'Enabled' : 'Disabled'}</strong></div>

      <div class="stats-grid" style="margin-top:14px;margin-bottom:14px;">
        <div class="stat-card"><div class="stat-value">${Number(stats.total_requests) || 0}</div><div class="stat-label">Requests</div></div>
        <div class="stat-card"><div class="stat-value">${Number(stats.successful_requests) || 0}</div><div class="stat-label">Successful</div></div>
        <div class="stat-card"><div class="stat-value">${Number(stats.error_requests) || 0}</div><div class="stat-label">Errors</div></div>
        <div class="stat-card"><div class="stat-value">${stats.avg_response_time ? Math.round(Number(stats.avg_response_time)) + 'ms' : '-'}</div><div class="stat-label">Avg Response</div></div>
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px;">
        <div style="font-weight:800;color:#111827;margin-bottom:8px;">Permissions</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${
            perms.length
              ? perms.map((p) => `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#111827;color:#e5e7eb;padding:2px 6px;border-radius:6px;font-size:12px;">${escapeHtml(p)}</span>`).join(' ')
              : '<span style="color:#6b7280;">None</span>'
          }
        </div>
      </div>

      <div style="margin-top:14px;font-weight:800;color:#111827;">Recent Usage</div>
      ${
        recent.length
          ? `
            <div class="table-container" style="margin-top:10px;box-shadow:none;border:1px solid #e5e7eb;">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Endpoint</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent
                    .map((r) => {
                      const t = r.created_at ? formatDateTime(toDate(r.created_at)) : '-';
                      const latency = r.response_time_ms ? `${Math.round(Number(r.response_time_ms))}ms` : '-';
                      return `
                        <tr>
                          <td>${escapeHtml(t)}</td>
                          <td>${escapeHtml(r.endpoint || '')}</td>
                          <td>${escapeHtml(r.method || '')}</td>
                          <td>${escapeHtml(String(r.status_code || ''))}</td>
                          <td>${escapeHtml(latency)}</td>
                          <td>${escapeHtml(r.ip_address || '')}</td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          : `<div style="margin-top:8px;color:#6b7280;">No usage recorded yet.</div>`
      }
    `;

    openModal(panel);
  }

  function openModal(panel) {
    const modal = panel.querySelector('#ak-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeModal(panel) {
    const modal = panel.querySelector('#ak-modal');
    if (modal) modal.style.display = 'none';
  }

  function setText(panel, sel, text) {
    const el = panel.querySelector(sel);
    if (el) el.textContent = text;
  }

  function showAlert(panel, msg) {
    const el = panel.querySelector('#ak-alert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
      el.textContent = '';
    }, 5000);
  }

  async function copyToClipboard(text, panel) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showAlert(panel, 'Copied to clipboard');
    } catch (_) {
      showAlert(panel, 'Copy failed');
    }
  }

  async function apiJson(path, options = {}) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('_t', String(AD.VERSION || Date.now()));

    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url.toString(), { ...options, headers });
    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { error: text || 'Invalid JSON response' };
    }

    if (!res.ok) {
      const msg = data?.error ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }

    return data;
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return null;
      // SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" (UTC)
      if (/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}/.test(s) && !s.includes('T')) {
        const d = new Date(s.replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function formatDateTime(date) {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  console.log('✅ Dashboard API Keys loaded');
})(window.AdminDashboard);
