/**
 * Emails Admin Module
 *
 * - Manage email templates
 * - Send manual email to a specific customer via Brevo
 */

(function(AD) {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function toast(msg, ok = true) {
    const el = document.getElementById('emails-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok ? '#10b981' : '#ef4444';
    setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }

  async function jfetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  const TEMPLATE_DEFINITIONS = [
    {
      type: 'order_confirmation',
      title: 'Order Confirmation',
      description: 'Sent immediately after an order is placed.'
    },
    {
      type: 'order_delivered',
      title: 'Order Delivered',
      description: 'Sent when an order is delivered/completed.'
    },
    {
      type: 'chat_notification',
      title: 'Chat Notification',
      description: 'Sent when support sends a new chat reply.'
    },
    {
      type: 'marketing',
      title: 'Marketing & Promotions',
      description: 'Used for promotions, campaigns, and outreach.'
    }
  ];

  async function loadEmails(panel) {
    panel.innerHTML = `
      <div style="max-width:940px;margin:0 auto;padding:20px;">
        <div id="emails-toast" style="display:none;position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:10px;color:white;font-weight:600;z-index:1000;"></div>

        <div style="margin-bottom:24px;">
          <h2 style="margin:0 0 8px;font-size:28px;color:#1f2937;">Email Center</h2>
          <p style="margin:0;color:#6b7280;font-size:15px;">Send manual emails and manage templates powered by your current Brevo setup.</p>
        </div>

        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #e5e7eb;">
          <h3 style="margin:0 0 10px;font-size:20px;color:#1f2937;">Send Manual Email</h3>
          <p style="margin:0 0 15px;color:#6b7280;font-size:14px;">Send a one-off email to any customer using Brevo.</p>

          <div style="display:grid;grid-template-columns:1fr;gap:12px;">
            <div>
              <label style="display:block;margin-bottom:5px;font-weight:600;color:#374151;font-size:14px;">Recipient Email</label>
              <input id="manual-email-to" type="email" placeholder="customer@example.com" style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;" />
            </div>
            <div>
              <label style="display:block;margin-bottom:5px;font-weight:600;color:#374151;font-size:14px;">Subject</label>
              <input id="manual-email-subject" type="text" placeholder="Your subject" style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;" />
            </div>
            <div>
              <label style="display:block;margin-bottom:5px;font-weight:600;color:#374151;font-size:14px;">Message</label>
              <textarea id="manual-email-message" rows="8" placeholder="Write your message..." style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;"></textarea>
            </div>
          </div>

          <div style="margin-top:14px;">
            <button id="manual-email-send-btn" class="btn btn-primary" style="padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;" onclick="AdminDashboard.sendManualEmail()">Send Email</button>
          </div>
        </div>

        <div id="email-templates-container"></div>
      </div>
    `;

    const container = panel.querySelector('#email-templates-container');
    let existing = [];

    try {
      const data = await jfetch('/api/admin/email-templates');
      existing = data.templates || [];
    } catch (e) {
      toast('Failed to load templates: ' + (e.message || ''), false);
    }

    const map = {};
    existing.forEach((tpl) => {
      map[tpl.type] = tpl;
    });

    let html = '';
    TEMPLATE_DEFINITIONS.forEach((def) => {
      const tpl = map[def.type] || {};
      const subject = escapeAttr(tpl.subject || '');
      const body = escapeHtml(tpl.body || '');

      html += `
        <div style="background:white;border-radius:16px;padding:25px;margin-bottom:25px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin:0 0 10px;font-size:20px;color:#1f2937;">${escapeHtml(def.title)}</h3>
          <p style="margin:0 0 15px;color:#6b7280;font-size:14px;">${escapeHtml(def.description)}</p>
          <div style="margin-bottom:15px;">
            <label style="display:block;margin-bottom:5px;font-weight:600;color:#374151;font-size:14px;">Subject</label>
            <input id="subject-${def.type}" type="text" value="${subject}" style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;" />
          </div>
          <div style="margin-bottom:15px;">
            <label style="display:block;margin-bottom:5px;font-weight:600;color:#374151;font-size:14px;">Body (HTML supported)</label>
            <textarea id="body-${def.type}" rows="6" style="width:100%;padding:12px 16px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;">${body}</textarea>
            <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Use placeholders like <code>{{order_id}}</code>, <code>{{customer_name}}</code>, <code>{{product_name}}</code>.</p>
          </div>
          <button class="btn btn-primary" style="padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;" onclick="AdminDashboard.saveEmailTemplate('${def.type}')">Save Template</button>
        </div>
      `;
    });

    container.innerHTML = html;
    toast('Email center loaded', true);
  }

  async function saveEmailTemplate(type) {
    const panel = document.getElementById('main-panel');
    const subjEl = panel.querySelector(`#subject-${type}`);
    const bodyEl = panel.querySelector(`#body-${type}`);
    if (!subjEl || !bodyEl) {
      toast('Cannot find template fields', false);
      return;
    }

    const payload = {
      type,
      subject: subjEl.value.trim(),
      body: bodyEl.value.trim()
    };

    try {
      await jfetch('/api/admin/email-templates', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      toast(type.replace(/_/g, ' ') + ' template saved', true);
    } catch (e) {
      toast('Failed to save template: ' + (e.message || ''), false);
    }
  }

  async function sendManualEmail() {
    const panel = document.getElementById('main-panel');
    const toEl = panel.querySelector('#manual-email-to');
    const subjectEl = panel.querySelector('#manual-email-subject');
    const messageEl = panel.querySelector('#manual-email-message');
    const sendBtn = panel.querySelector('#manual-email-send-btn');

    if (!toEl || !subjectEl || !messageEl || !sendBtn) {
      toast('Cannot find manual email fields', false);
      return;
    }

    const payload = {
      to: toEl.value.trim(),
      subject: subjectEl.value.trim(),
      message: messageEl.value.trim()
    };

    if (!payload.to || !payload.subject || !payload.message) {
      toast('Recipient, subject, and message are required', false);
      return;
    }

    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const data = await jfetch('/api/admin/email/send', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const msgId = data.messageId ? ` (id: ${data.messageId})` : '';
      toast(`Email sent to ${payload.to}${msgId}`, true);
      messageEl.value = '';
    } catch (e) {
      toast('Failed to send email: ' + (e.message || ''), false);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = originalText || 'Send Email';
    }
  }

  AD.loadEmails = loadEmails;
  AD.saveEmailTemplate = saveEmailTemplate;
  AD.sendManualEmail = sendManualEmail;
})(window.AdminDashboard = window.AdminDashboard || {});

