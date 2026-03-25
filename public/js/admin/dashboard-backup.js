/**
 * Modern Backup System 2025 - Clean & Essential
 * Based on 3-2-1 backup principle + Cloudflare best practices
 * 
 * Features:
 * - Automated daily backups
 * - Manual backup on demand
 * - Restore functionality
 * - Backup history
 * - Cloudflare D1 optimized
 */

(function(AD) {
  
  function toast(msg, ok=true) {
    const el = document.getElementById('backup-toast');
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
    let data;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadBackup(panel) {
    panel.innerHTML = `
      <div style="max-width:900px;margin:0 auto;padding:20px;">
        <div id="backup-toast" style="display:none;position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:10px;color:white;font-weight:600;z-index:1000;"></div>
        
        <!-- Header -->
        <div style="margin-bottom:30px;">
          <h2 style="margin:0 0 8px;font-size:28px;color:#1f2937;">💾 Backup Manager</h2>
          <p style="margin:0;color:#6b7280;font-size:15px;">Automated backups for your website data</p>
        </div>

        <!-- Info Card -->
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid #3b82f6;">
          <h3 style="margin:0 0 15px;font-size:18px;color:#1f2937;">📋 Backup Strategy</h3>
          <ul style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.8;">
            <li><strong>Automatic:</strong> Daily backups at 2:00 AM UTC</li>
            <li><strong>Retention:</strong> Last 7 backups kept</li>
            <li><strong>Storage:</strong> Secure Cloudflare storage</li>
            <li><strong>Content:</strong> All website data & settings</li>
          </ul>
        </div>

        <!-- Backup Controls -->
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 20px;font-size:18px;color:#1f2937;">🔄 Create Backup</h3>
          
          <div style="display:flex;gap:15px;align-items:center;">
            <button onclick="AD.createBackup()" 
              style="padding:14px 28px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(59,130,246,0.3);">
              💾 Create New Backup
            </button>
            <span style="color:#6b7280;font-size:14px;">Manually backup all your data now</span>
          </div>
          
          <div id="backup-progress" style="display:none;margin-top:20px;padding:15px;background:#eff6ff;border-radius:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="spinner" style="width:20px;height:20px;border:2px solid #3b82f6;border-top:2px solid transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>
              <span style="color:#1e40af;font-weight:600;">Creating backup... Please wait</span>
            </div>
          </div>
        </div>


        <!-- Import / Restore Backup -->
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 20px;font-size:18px;color:#1f2937;">📥 Import / Restore</h3>
          <p style="margin:0 0 12px;color:#6b7280;line-height:1.5;">
            Upload a backup JSON to reset database and restore everything. Media files are not included (links only).
          </p>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <input id="backup-import-file" type="file" accept=".json,application/json"
              style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;min-width:260px;" />
            <button onclick="AD.importBackup()" 
              style="padding:12px 22px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:600;">
              Import & Restore
            </button>
          </div>
          <div id="backup-import-status" style="margin-top:12px;color:#6b7280;font-size:13px;"></div>
        </div>

        <!-- Backup History -->
        <div style="background:white;border-radius:16px;padding:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="display:flex;justify-content:space-between;align-items-center;margin-bottom:20px;">
            <h3 style="margin:0;font-size:18px;color:#1f2937;">📜 Backup History</h3>
            <span id="history-count" style="background:#e5e7eb;padding:5px 12px;border-radius:20px;font-size:14px;color:#4b5563;">Loading...</span>
          </div>
          
          <div id="backup-history" style="min-height:100px;">
            <div style="text-align:center;padding:40px 20px;color:#9ca3af;">
              <div style="font-size:48px;margin-bottom:12px;">⏳</div>
              <p style="margin:0;font-size:16px;">Loading backup history...</p>
            </div>
          </div>
        </div>

        <!-- Tips -->
        <div style="margin-top:30px;padding:20px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
          <h4 style="margin:0 0 12px;font-size:16px;color:#1f2937;">💡 Best Practices</h4>
          <ul style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.8;">
            <li>Create backup before major changes or updates</li>
            <li>Test restore functionality periodically</li>
            <li>Keep backups for at least 30 days</li>
            <li>Monitor backup sizes and retention</li>
          </ul>
        </div>
      </div>

      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinner {
          animation: spin 1s linear infinite;
        }
      </style>
    `;

    // Load backup history
    await loadBackupHistory();
  }

  async function loadBackupHistory() {
    const panel = document.getElementById('main-panel');
    try {
      const data = await jfetch('/api/admin/backup/history');
      const backups = data.backups || [];
      
      const historyDiv = panel.querySelector('#backup-history');
      const countSpan = panel.querySelector('#history-count');
      
      if (backups.length === 0) {
        historyDiv.innerHTML = `
          <div style="text-align:center;padding:40px 20px;color:#9ca3af;">
            <div style="font-size:48px;margin-bottom:12px;">💾</div>
            <p style="margin:0;font-size:16px;">No backups created yet</p>
            <p style="margin-top:8px;font-size:14px;">Create your first backup to get started</p>
          </div>
        `;
      } else {
        historyDiv.innerHTML = `
          <div style="display:grid;gap:12px;">
            ${backups.map((backup, index) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <div>
                  <div style="font-weight:600;color:#1f2937;font-size:15px;">${formatDateTime(backup.timestamp)}</div>
                  <div style="font-size:13px;color:#6b7280;margin-top:4px;">${backup.size ? formatBytes(backup.size) : 'Size unknown'}</div>
                </div>
                <div style="display:flex;gap:8px;">
                  <button onclick="AD.restoreBackup('${backup.id}')" 
                    style="padding:8px 16px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;"
                    ${backup.is_current ? 'disabled' : ''}>
                    ${backup.is_current ? 'Current' : 'Restore'}
                  </button>
                  <button onclick="AD.downloadBackup('${backup.id}')" 
                    style="padding:8px 16px;background:#374151;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">
                    Download
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      countSpan.textContent = `${backups.length} backup${backups.length !== 1 ? 's' : ''}`;
      
    } catch (e) {
      historyDiv.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#9ca3af;">
          <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
          <p style="margin:0;font-size:16px;">Failed to load backup history</p>
          <p style="margin-top:8px;font-size:14px;">Please try again later</p>
        </div>
      `;
    }
  }

  async function createBackup() {
    const panel = document.getElementById('main-panel');
    const progressDiv = panel.querySelector('#backup-progress');
    progressDiv.style.display = 'block';
    
    try {
      await jfetch('/api/admin/backup/create', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      toast('✅ Backup created successfully!', true);
      await loadBackupHistory();
    } catch (e) {
      toast('❌ ' + (e && e.message ? e.message : 'Failed to create backup'), false);
    } finally {
      progressDiv.style.display = 'none';
    }
  }

  async function restoreBackup(id) {
    if (!confirm('⚠️ Warning: This will restore your website to this backup. All current data will be replaced. Are you sure?')) {
      return;
    }
    
    try {
      await jfetch('/api/admin/backup/restore', {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      
      toast('✅ Restore completed! Page will refresh...', true);
      setTimeout(() => location.reload(), 2000);
    } catch (e) {
      toast('❌ Failed to restore backup', false);
    }
  }

  async function downloadBackup(id) {
    toast('Preparing backup for download...', true);
    window.open(`/api/admin/backup/download/${id}`, '_blank');
  }

  function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  
  async function importBackup() {
    const input = document.getElementById('backup-import-file');
    const statusEl = document.getElementById('backup-import-status');
    if (!input || !input.files || !input.files[0]) {
      if (statusEl) statusEl.textContent = 'Please choose a backup JSON file first.';
      toast('❌ Please choose a backup file', false);
      return;
    }
    const file = input.files[0];
    try {
      if (statusEl) statusEl.textContent = 'Reading backup file...';
      const text = await file.text();
      // Basic validation
      const obj = JSON.parse(text);
      if (!obj || obj.kind !== 'wishesu_full_backup') {
        toast('❌ Invalid backup file', false);
        if (statusEl) statusEl.textContent = 'Invalid backup format.';
        return;
      }
      const ok = confirm('This will RESET your database and restore from this backup. Continue?');
      if (!ok) return;

      if (statusEl) statusEl.textContent = 'Uploading & restoring...';
      await jfetch('/api/admin/backup/import', {
        method: 'POST',
        body: JSON.stringify({ backupJson: text })
      });
      toast('✅ Backup imported & restored', true);
      if (statusEl) statusEl.textContent = 'Restore complete. Reloading...';
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      const msg = e?.message || 'Import failed';
      toast('❌ ' + msg, false);
      if (statusEl) statusEl.textContent = msg;
    }
  }

// Export
  AD.loadBackup = loadBackup;
  AD.createBackup = createBackup;
  AD.restoreBackup = restoreBackup;
  AD.downloadBackup = downloadBackup;
  AD.importBackup = importBackup;

})(window.AdminDashboard);
