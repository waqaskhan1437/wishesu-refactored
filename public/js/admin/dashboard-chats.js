/**
 * Dashboard Chats - Customer chat inbox management
 */

(function(AD) {
  AD.loadChats = async function(panel) {
    panel.innerHTML = `
      <div style="display:flex; gap:16px; height:calc(100vh - 170px); min-height:560px;">
        <!-- Master: Sessions list -->
        <div style="width:30%; min-width:320px; max-width:420px; background:#fff; border:1px solid #d1d5db; border-radius:10px; overflow:hidden; display:flex; flex-direction:column;">
          <div style="padding:12px 14px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-weight:700; color:#111827;">💬 Chats</div>
              <div style="font-size:12px; color:#6b7280; margin-top:2px;">Inbox-style customer conversations</div>
            </div>
            <button id="chats-refresh" class="btn btn-secondary" style="padding:8px 10px; border-radius:8px;">Refresh</button>
          </div>
          <div style="padding:10px 14px; border-bottom:1px solid #e5e7eb;">
            <input id="chats-search" placeholder="Search name or email..." style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;" />
          </div>
          <div id="chats-sessions-list" style="overflow:auto; flex:1;"></div>
        </div>

        <!-- Detail: Chat view -->
        <div style="flex:1; background:#fff; border:1px solid #d1d5db; border-radius:10px; overflow:hidden; display:flex; flex-direction:column;">
          <div id="chats-header" style="padding:12px 14px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div id="chats-detail-title" style="font-weight:700; color:#111827;">Select a conversation</div>
              <div id="chats-detail-subtitle" style="font-size:12px; color:#6b7280; margin-top:2px;">Click a user on the left to view messages</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button id="chats-block-btn" class="btn btn-secondary" style="padding:8px 10px; border-radius:8px; display:none;">[🚫 Block]</button>
              <button id="chats-delete-btn" class="btn btn-danger" style="padding:8px 10px; border-radius:8px; display:none; background:#dc2626; color:white; border:none;">[🗑️ Delete]</button>
            </div>
          </div>
          <div id="chats-blocked-banner" style="display:none; padding:10px 14px; background:#fef2f2; border-bottom:1px solid #fecaca; color:#991b1b; font-size:13px;">
            🔒 This user is blocked. They cannot send new messages.
          </div>
          <div id="chats-messages" style="flex:1; overflow:auto; padding:14px; background:#f9fafb;"></div>
          <div style="padding:12px 14px; border-top:1px solid #e5e7eb;">
            <div style="display:flex; gap:10px; align-items:flex-start;">
              <div style="flex:1;">
                <textarea id="chats-input" maxlength="500" rows="2" placeholder="Write a reply..." style="width:100%; resize:none; padding:10px; border:1px solid #d1d5db; border-radius:10px; font-size:14px; line-height:1.35;"></textarea>
                <div style="display:flex; justify-content:flex-end; font-size:12px; color:#6b7280; margin-top:6px;">
                  <span id="chats-counter">0/500</span>
                </div>
              </div>
              <button id="chats-send" class="btn btn-primary" style="padding:10px 14px; border-radius:10px; font-weight:700;">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const sessionsListEl = panel.querySelector('#chats-sessions-list');
    const searchEl = panel.querySelector('#chats-search');
    const refreshBtn = panel.querySelector('#chats-refresh');
    const detailTitleEl = panel.querySelector('#chats-detail-title');
    const detailSubtitleEl = panel.querySelector('#chats-detail-subtitle');
    const blockBtn = panel.querySelector('#chats-block-btn');
    const deleteBtn = panel.querySelector('#chats-delete-btn');
    const blockedBanner = panel.querySelector('#chats-blocked-banner');
    const messagesEl = panel.querySelector('#chats-messages');
    const inputEl = panel.querySelector('#chats-input');
    const sendBtn = panel.querySelector('#chats-send');
    const counterEl = panel.querySelector('#chats-counter');

    const POLL_MS = 10000;
    let sessions = [];
    let active = null;
    let lastId = 0;
    let pollTimer = null;
    let isSending = false;
    let isBlocking = false;
    let isDeleting = false;

    function escapeText(str) {
      return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }

    function formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' });
    }

    function stopPolling() {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    }

    // Disable background polling to reduce unnecessary requests. Instead of
    // repeatedly hitting the server every few seconds, perform a single
    // sync when an event occurs (e.g. opening the chat, switching tabs).
    function startPolling() {
      // Only run a single sync of messages and sessions. Avoid creating
      // a recurring interval so that the UI remains responsive without
      // spamming the server.
      if (pollTimer) return;
      pollTimer = true;
      // When called, perform one-time refresh if active session exists
      if (!document.hidden && active?.id) {
        syncMessages(false);
        refreshSessions(false);
      }
    }

    function setActiveSession(sess) {
      active = sess;
      lastId = 0;
      messagesEl.innerHTML = '';
      detailTitleEl.textContent = `${sess.name || 'Customer'}`;
      detailSubtitleEl.textContent = `${sess.email || ''}`;
      blockBtn.style.display = 'inline-block';
      deleteBtn.style.display = 'inline-block';
      updateBlockedUI(!!sess.blocked);
      renderSessionsList();
      // Immediately fetch messages and sessions once when a session is selected
      syncMessages(true);
      refreshSessions(true);
      // Do not schedule repeated polling; a single call is sufficient
      startPolling();
    }

    function updateBlockedUI(isBlocked) {
      blockedBanner.style.display = isBlocked ? 'block' : 'none';
      blockBtn.textContent = isBlocked ? '[✅ Unblock]' : '[🚫 Block]';
    }

    function renderSessionsList() {
      const q = String(searchEl.value || '').trim().toLowerCase();
      const filtered = !q ? sessions : sessions.filter(s => {
        const n = String(s.name || '').toLowerCase();
        const e = String(s.email || '').toLowerCase();
        const lm = String(s.last_message_content || '').toLowerCase();
        return n.includes(q) || e.includes(q) || lm.includes(q);
      });

      sessionsListEl.innerHTML = '';
      if (!filtered.length) {
        sessionsListEl.innerHTML = `<div style="padding:14px; color:#6b7280;">No chats found.</div>`;
        return;
      }

      for (const s of filtered) {
        const row = document.createElement('div');
        row.dataset.sessionId = String(s.id);
        const isActive = active?.id === s.id;
        const isBlocked = Number(s.blocked || 0) === 1;
        const bg = isActive ? (isBlocked ? '#7f1d1d' : '#111827') : (isBlocked ? '#fef2f2' : '#fff');
        const fg = isActive ? '#fff' : '#111827';

        row.style.cssText = `padding:12px 14px; border-bottom:1px solid #f3f4f6; cursor:pointer; background:${bg}; color:${fg};`;
        const name = escapeText(s.name || 'Unknown');
        const email = escapeText(s.email || '');
        const preview = escapeText(String(s.last_message_content || '').slice(0, 80));
        const time = formatTime(s.last_message_at || s.created_at);

        row.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${isBlocked ? '🔴 ' : ''}${name}</div>
            <div style="font-size:12px; opacity:${isActive ? '0.85' : '0.65'};">${escapeText(time)}</div>
          </div>
          <div style="font-size:12px; opacity:${isActive ? '0.9' : '0.7'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${email}</div>
          <div style="font-size:12px; opacity:${isActive ? '0.9' : '0.7'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:6px;">${preview || '<span style="opacity:.7;">No messages yet</span>'}</div>
        `;

        row.addEventListener('click', () => setActiveSession({
          id: s.id,
          name: s.name,
          email: s.email,
          blocked: Number(s.blocked || 0) === 1
        }));

        sessionsListEl.appendChild(row);
      }
    }

    function appendMessage(m) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:10px 0; display:flex; flex-direction:column; gap:4px;';
      wrap.style.alignItems = m.role === 'admin' ? 'flex-end' : 'flex-start';

      const bubble = document.createElement('div');
      bubble.style.cssText = `max-width:78%; border-radius:12px; padding:10px 12px; border:1px solid ${m.role === 'admin' ? '#111827' : '#e5e7eb'}; background:${m.role === 'admin' ? '#111827' : '#fff'}; color:${m.role === 'admin' ? '#fff' : '#111827'}; white-space:pre-wrap; word-break:break-word; font-size:14px; line-height:1.35; box-shadow:0 6px 16px rgba(0,0,0,0.06);`;
      bubble.innerHTML = escapeText(m.content);

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:12px; color:#6b7280;';
      meta.textContent = `${m.role === 'admin' ? 'Admin' : (m.role === 'user' ? 'Customer' : 'System')}${m.created_at ? ` • ${formatTime(m.created_at)}` : ''}`;

      wrap.appendChild(bubble);
      wrap.appendChild(meta);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function refreshSessions(autoSelectIfEmpty = true) {
      const data = await AD.apiFetch('/api/admin/chats/sessions');
      sessions = (data.sessions || []);

      if (active?.id) {
        const fresh = sessions.find(s => s.id === active.id);
        if (fresh) {
          active.blocked = Number(fresh.blocked || 0) === 1;
          updateBlockedUI(active.blocked);
        }
      }

      renderSessionsList();

      if (autoSelectIfEmpty && !active?.id && sessions.length) {
        setActiveSession({
          id: sessions[0].id,
          name: sessions[0].name,
          email: sessions[0].email,
          blocked: Number(sessions[0].blocked || 0) === 1
        });
      }
    }

    async function syncMessages(clear) {
      if (!active?.id) return;
      const data = await AD.apiFetch(`/api/chat/sync?sessionId=${encodeURIComponent(active.id)}&sinceId=${encodeURIComponent(String(lastId))}`);
      const msgs = data.messages || [];

      if (clear) messagesEl.innerHTML = '';

      for (const m of msgs) {
        lastId = Math.max(lastId, Number(m.id) || lastId);
        appendMessage(m);
      }
    }

    async function toggleBlock() {
      if (!active?.id || isBlocking) return;
      const previous = !!active.blocked;
      const next = !previous;

      isBlocking = true;
      blockBtn.disabled = true;
      active.blocked = next;
      updateBlockedUI(next);

      const idx = sessions.findIndex(s => s.id === active.id);
      if (idx !== -1) sessions[idx].blocked = next ? 1 : 0;
      renderSessionsList();

      try {
        await AD.apiFetch('/api/admin/chats/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: active.id, blocked: next })
        });
        await refreshSessions(false);
      } catch (e) {
        active.blocked = previous;
        updateBlockedUI(previous);
        if (idx !== -1) sessions[idx].blocked = previous ? 1 : 0;
        renderSessionsList();
        alert(e?.message || 'Failed to update block status');
      } finally {
        isBlocking = false;
        blockBtn.disabled = false;
      }
    }

    async function deleteChat() {
      if (!active?.id || isDeleting) return;
      if (!confirm('Are you sure you want to permanently delete this chat and all messages?')) return;

      isDeleting = true;
      deleteBtn.disabled = true;
      const deletingId = active.id;

      sessions = sessions.filter(s => s.id !== deletingId);
      renderSessionsList();

      active = null;
      lastId = 0;
      messagesEl.innerHTML = '';
      detailTitleEl.textContent = 'Select a conversation';
      detailSubtitleEl.textContent = 'Click a user on the left to view messages';
      blockBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      blockedBanner.style.display = 'none';
      stopPolling();

      try {
        await AD.apiFetch('/api/admin/chats/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: deletingId })
        });

        if (sessions.length) {
          setActiveSession({
            id: sessions[0].id,
            name: sessions[0].name,
            email: sessions[0].email,
            blocked: Number(sessions[0].blocked || 0) === 1
          });
        }
      } catch (e) {
        alert(e?.message || 'Failed to delete chat');
        await refreshSessions(true);
      } finally {
        isDeleting = false;
        deleteBtn.disabled = false;
      }
    }

    async function sendReply() {
      if (isSending) return;
      if (!active?.id) return alert('Select a chat first.');

      const text = String(inputEl.value || '').trim();
      if (!text) return;
      if (text.length > 500) return alert('Max 500 characters.');

      isSending = true;
      sendBtn.disabled = true;

      try {
        // Send the admin message and capture the returned messageId
        const resp = await AD.apiFetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: active.id, role: 'admin', content: text })
        });

        // Immediately show the message in the UI for responsiveness
        appendMessage({ role: 'admin', content: text, created_at: new Date().toISOString() });
        // If the server returns messageId, update lastId to avoid duplicate on sync
        if (resp && typeof resp.messageId !== 'undefined') {
          const idNum = Number(resp.messageId);
          if (!isNaN(idNum)) {
            lastId = Math.max(lastId, idNum);
          }
        }

        inputEl.value = '';
        counterEl.textContent = '0/500';

        // Sync to fetch any new messages (customer replies) after this ID
        await syncMessages(false);
        await refreshSessions(false);
      } catch (e) {
        alert(e?.message || 'Failed to send');
      } finally {
        isSending = false;
        sendBtn.disabled = false;
      }
    }

    // Events
    refreshBtn.addEventListener('click', () => refreshSessions(false));
    searchEl.addEventListener('input', renderSessionsList);
    inputEl.addEventListener('input', () => {
      counterEl.textContent = `${(inputEl.value || '').length}/500`;
    });
    sendBtn.addEventListener('click', sendReply);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendReply();
      }
    });
    blockBtn.addEventListener('click', toggleBlock);
    deleteBtn.addEventListener('click', deleteChat);

    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && active?.id) {
        await syncMessages(false);
        await refreshSessions(false);
      }
    });

    // Stop polling if panel is removed
    const obs = new MutationObserver(() => {
      if (!document.body.contains(panel)) {
        stopPolling();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    await refreshSessions(true);
  };

  console.log('✅ Dashboard Chats loaded');
})(window.AdminDashboard);
