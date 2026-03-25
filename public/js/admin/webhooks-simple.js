/**
 * Simple Webhook Management UI v3.0
 * Clean, Fast, Universal
 * Modified to render in main panel instead of modal
 */

(function() {
  'use strict';
  
  let config = null;
  
  const EVENT_TYPES = {
    'order.received': { icon: '🎉', label: 'Order Received', desc: 'New order placed', audience: 'admin' },
    'order.delivered': { icon: '📦', label: 'Order Delivered', desc: 'Order completed', audience: 'admin' },
    'tip.received': { icon: '💰', label: 'Tip Received', desc: 'Customer tip', audience: 'admin' },
    'review.submitted': { icon: '⭐', label: 'Review Submitted', desc: 'New review', audience: 'admin' },
    'blog.comment': { icon: '📝', label: 'Blog Comment', desc: 'New blog comment', audience: 'admin' },
    'forum.question': { icon: '❓', label: 'Forum Question', desc: 'New question', audience: 'admin' },
    'forum.reply': { icon: '💬', label: 'Forum Reply', desc: 'New forum reply', audience: 'admin' },
    'chat.message': { icon: '💬', label: 'Chat Message', desc: 'New support chat', audience: 'admin' },
    'backup.created': { icon: '🗄️', label: 'Backup Created', desc: 'Manual/API/cron backup created', audience: 'admin' },
    // New event: revision request
    'order.revision_requested': { icon: '♻️', label: 'Revision Requested', desc: 'Order revision requested', audience: 'admin' },
    'customer.order.confirmed': { icon: '✅', label: 'Order Confirmed (Customer)', desc: 'Send to customer', audience: 'customer' },
    'customer.order.delivered': { icon: '🎬', label: 'Order Delivered (Customer)', desc: 'Send to customer', audience: 'customer' },
    'customer.chat.reply': { icon: '💬', label: 'Chat Reply (Customer)', desc: 'Send to customer', audience: 'customer' },
    'customer.forum.reply': { icon: '💬', label: 'Forum Reply (Customer)', desc: 'Send to customer', audience: 'customer' }
  };
  
  function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }
  
  async function loadConfig() {
    try {
      const res = await fetch('/api/admin/webhooks/settings');
      const data = await res.json();
      config = data.config || getDefaultConfig();
    } catch (e) {
      console.error('Load config error:', e);
      config = getDefaultConfig();
    }
    return config;
  }
  
  function getDefaultConfig() {
    return {
      enabled: false,
      endpoints: []
    };
  }
  
  async function saveConfig() {
    try {
      const res = await fetch('/api/admin/webhooks/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      return data.success;
    } catch (e) {
      console.error('Save error:', e);
      return false;
    }
  }
  
  // New function to load into main panel
  window.loadWebhooks = async function(panel) {
    panel.innerHTML = '<div style="padding:20px;text-align:center;">⏳ Loading Webhook Settings...</div>';
    await loadConfig();
    renderInPanel(panel);
  };
  
  function renderInPanel(panel) {
    const html = `
      <div style="background:white;border-radius:16px;width:100%;display:flex;flex-direction:column;box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="padding:24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h2 style="margin:0;font-size:20px;color:#1f2937;">⚡ Universal Webhooks</h2>
            <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Connect to Make.com, n8n, Zapier, or any webhook service</p>
          </div>
        </div>
        
        <!-- Master Toggle -->
        <div style="padding:20px 24px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <label style="display:flex;align-items:center;cursor:pointer;font-weight:500;">
            <input type="checkbox" id="master-enabled" ${config.enabled ? 'checked' : ''} onchange="toggleWebhooks(this.checked)" style="width:20px;height:20px;margin-right:12px;cursor:pointer;">
            <span style="color:#1f2937;">Enable Webhooks System</span>
          </label>
          ${config.enabled ? '<p style="margin:8px 0 0 32px;font-size:13px;color:#059669;">✓ Webhooks are active</p>' : '<p style="margin:8px 0 0 32px;font-size:13px;color:#9ca3af;">Webhooks are disabled</p>'}
        </div>
        
        <!-- Content -->
        <div style="padding:24px;">
          <!-- Endpoints Section -->
          <div style="margin-bottom:32px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <h3 style="margin:0;font-size:16px;color:#1f2937;">Webhook Endpoints</h3>
              <button onclick="addWebhookEndpoint()" style="background:#667eea;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">+ Add Endpoint</button>
            </div>
            <div id="endpoints-container">
              ${renderEndpoints()}
            </div>
          </div>
          
          <!-- Your Webhook URLs -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-top:24px;margin-bottom:24px;">
            <h4 style="margin:0 0 12px;color:#166534;font-size:15px;">🔗 Your Server Webhook URLs</h4>
            <p style="margin:0 0 12px;font-size:13px;color:#15803d;">Copy these links to your external services (Whop, Gumroad, etc.)</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="background:white;padding:10px;border-radius:8px;border:1px solid #dcfce7;">
                <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">Whop Webhook</div>
                <code style="font-size:12px;color:#111827;word-break:break-all;">${window.location.origin}/api/whop/webhook</code>
              </div>
              <div style="background:white;padding:10px;border-radius:8px;border:1px solid #dcfce7;">
                <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">PayPal Webhook</div>
                <code style="font-size:12px;color:#111827;word-break:break-all;">${window.location.origin}/api/paypal/webhook</code>
              </div>
              <div style="background:white;padding:10px;border-radius:8px;border:1px solid #dcfce7;">
                <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:4px;">Universal (Gumroad/Stripe/etc)</div>
                <code style="font-size:12px;color:#111827;word-break:break-all;">${window.location.origin}/api/payment/universal/webhook</code>
              </div>
            </div>
          </div>

          <!-- Quick Setup Guide -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-top:24px;">
            <h4 style="margin:0 0 12px;color:#1e40af;font-size:15px;">📘 Quick Setup Guide</h4>
            <ol style="margin:0;padding-left:20px;color:#1e3a8a;font-size:14px;line-height:1.8;">
              <li><strong>Make.com</strong>: Create scenario → Add "Webhook" trigger → Copy URL → Paste above</li>
              <li><strong>n8n</strong>: Add "Webhook" node → Copy Production URL → Paste above</li>
              <li><strong>Zapier</strong>: Create Zap → Choose "Webhooks by Zapier" → Copy URL → Paste above</li>
              <li>Select which events to listen to (order, review, chat, etc.)</li>
              <li>Test webhook to verify connection</li>
            </ol>
            <p style="margin:12px 0 0;font-size:13px;color:#3730a3;"><strong>Email Setup:</strong> Use Make.com's "Email" module to send notifications via any email provider (Gmail, SendGrid, etc.)</p>
          </div>
          
          <!-- Event Types Reference -->
          <div style="margin-top:24px;">
            <h4 style="margin:0 0 12px;font-size:15px;color:#1f2937;">📋 Available Events</h4>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
              ${Object.entries(EVENT_TYPES).map(([key, info]) => `
                <div style="background:#f9fafb;padding:12px;border-radius:8px;border:1px solid #e5e7eb;">
                  <div style="font-weight:600;color:#1f2937;font-size:13px;">${info.icon} ${info.label}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:2px;">${info.desc}</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Event: <code style="background:#e5e7eb;padding:2px 4px;border-radius:3px;font-size:10px;">${key}</code></div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding:20px 24px;border-top:1px solid #e5e7eb;display:flex;gap:12px;justify-content:flex-end;">
          <button onclick="saveWebhookConfig()" style="background:#10b981;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:500;">Save Changes</button>
        </div>
      </div>
    `;
    
    panel.innerHTML = html;
  }
  
  function renderEndpoints() {
    if (!config.endpoints || config.endpoints.length === 0) {
      return `<div style="text-align:center;padding:40px 20px;color:#9ca3af;">
        <div style="font-size:48px;margin-bottom:12px;">🔗</div>
        <p style="margin:0;font-size:14px;">No webhook endpoints configured yet</p>
        <p style="margin:8px 0 0;font-size:13px;">Click "Add Endpoint" to get started</p>
      </div>`;
    }
    
    return config.endpoints.map(endpoint => `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:start;gap:16px;">
          <!-- Enable Toggle -->
          <input type="checkbox" ${endpoint.enabled ? 'checked' : ''} onchange="toggleEndpoint('${endpoint.id}', this.checked)" style="margin-top:4px;width:18px;height:18px;cursor:pointer;">
          
          <!-- Details -->
          <div style="flex:1;">
            <!-- Name & URL -->
            <div style="display:flex;gap:12px;margin-bottom:12px;">
              <input type="text" value="${endpoint.name || ''}" onchange="updateEndpoint('${endpoint.id}', 'name', this.value)" placeholder="Endpoint Name" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
              <input type="url" value="${endpoint.url || ''}" onchange="updateEndpoint('${endpoint.id}', 'url', this.value)" placeholder="https://webhook-url.com" style="flex:2;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
            </div>
            
            <!-- Secret (Optional) -->
            <div style="margin-bottom:12px;">
              <input type="password" value="${endpoint.secret || ''}" onchange="updateEndpoint('${endpoint.id}', 'secret', this.value)" placeholder="Secret key (optional, for security)" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Secret will be sent in X-Webhook-Secret header + HMAC signature in X-Webhook-Signature</p>
            </div>
            
            <!-- Events Selection -->
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:8px;">Listen to these events:</label>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${Object.entries(EVENT_TYPES).map(([key, info]) => `
                  <label style="display:flex;align-items:center;font-size:12px;cursor:pointer;padding:6px;background:white;border:1px solid #e5e7eb;border-radius:6px;">
                    <input type="checkbox" ${endpoint.events?.includes(key) ? 'checked' : ''} onchange="toggleEndpointEvent('${endpoint.id}', '${key}', this.checked)" style="margin-right:6px;cursor:pointer;">
                    <span style="color:#374151;">${info.icon} ${info.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            
            <!-- Actions -->
            <div style="display:flex;gap:8px;">
              <button onclick="testWebhookEndpoint('${endpoint.id}')" style="background:#3b82f6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">🧪 Test</button>
              <button onclick="removeEndpoint('${endpoint.id}')" style="background:#ef4444;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">🗑️ Remove</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  function refreshEndpoints() {
    const container = document.getElementById('endpoints-container');
    if (container) container.innerHTML = renderEndpoints();
  }
  
  window.toggleWebhooks = function(enabled) {
    config.enabled = enabled;
  };
  
  window.addWebhookEndpoint = function() {
    config.endpoints.push({
      id: generateId(),
      name: 'New Endpoint',
      url: '',
      secret: '',
      events: [],
      enabled: true
    });
    refreshEndpoints();
  };
  
  window.removeEndpoint = function(id) {
    if (confirm('Remove this webhook endpoint?')) {
      config.endpoints = config.endpoints.filter(e => e.id !== id);
      refreshEndpoints();
    }
  };
  
  window.toggleEndpoint = function(id, enabled) {
    const endpoint = config.endpoints.find(e => e.id === id);
    if (endpoint) endpoint.enabled = enabled;
  };
  
  window.updateEndpoint = function(id, field, value) {
    const endpoint = config.endpoints.find(e => e.id === id);
    if (endpoint) endpoint[field] = value;
  };
  
  window.toggleEndpointEvent = function(id, event, checked) {
    const endpoint = config.endpoints.find(e => e.id === id);
    if (!endpoint) return;
    
    if (!endpoint.events) endpoint.events = [];
    
    if (checked) {
      if (!endpoint.events.includes(event)) {
        endpoint.events.push(event);
      }
    } else {
      endpoint.events = endpoint.events.filter(e => e !== event);
    }
  };
  
  window.testWebhookEndpoint = async function(id) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '⏳ Testing...';
    btn.disabled = true;
    
    try {
      // Auto-save so tests work even if user didn't click Save Changes
      const saved = await saveConfig();
      if (!saved) {
        alert('❌ Webhook test failed!\n\nError: Could not save webhook config. Please click “Save Changes” and try again.');
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
      const res = await fetch(`/api/admin/webhooks/test/${id}`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        alert('✅ Webhook test successful!\n\nStatus: ' + (data.status || 200) + '\nResponse: ' + (data.response || 'OK'));
      } else {
        alert('❌ Webhook test failed!\n\nError: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('❌ Test failed: ' + e.message);
    }
    
    btn.textContent = originalText;
    btn.disabled = false;
  };
  
  window.saveWebhookConfig = async function() {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '⏳ Saving...';
    btn.disabled = true;
    
    const success = await saveConfig();
    
    if (success) {
      alert('✅ Webhook settings saved successfully!');
      // No need to close modal anymore, just refresh the view
      window.loadWebhooks(document.getElementById('main-panel'));
    } else {
      alert('❌ Failed to save settings. Please try again.');
    }
    
    btn.textContent = originalText;
    btn.disabled = false;
  };
  
})();
