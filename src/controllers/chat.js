/**
 * Chat controller - Customer and Admin chat functionality
 */

import { json } from '../utils/response.js';
import { escapeHtml, normalizeQuickAction } from '../utils/formatting.js';
import { enforceUserRateLimit } from '../utils/validation.js';
import { getLatestOrderForEmail } from '../utils/order-helpers.js';
import { notifyChatMessage, notifyCustomerChatReply } from './webhooks.js';

/**
 * Start a new chat session or reuse existing one
 */

// Session cache to reduce DB lookups
const sessionCache = new Map();
const SESSION_CACHE_TTL = 300000; // 5 minutes

function getSessionFromCache(sessionId) {
  const cached = sessionCache.get(sessionId);
  if (cached && (Date.now() - cached.time) < SESSION_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setSessionCache(sessionId, data) {
  sessionCache.set(sessionId, { data, time: Date.now() });
  // Limit cache size
  if (sessionCache.size > 1000) {
    const firstKey = sessionCache.keys().next().value;
    sessionCache.delete(firstKey);
  }
}

export async function startChat(env, body) {
  const nameIn = String(body.name || '').trim();
  const emailIn = String(body.email || '').trim();

  if (!nameIn || !emailIn) return json({ error: 'Name and email are required' }, 400);

  const email = emailIn.toLowerCase();
  const name = nameIn;

  // One email = one session (reuse + cleanup)
  const canonical = await env.DB.prepare(
    `SELECT id, name, created_at
     FROM chat_sessions
     WHERE lower(email) = lower(?)
     ORDER BY datetime(created_at) ASC
     LIMIT 1`
  ).bind(email).first();

  if (canonical?.id) {
    const canonicalId = String(canonical.id);

    // Update name if it changed
    if (name && canonical.name !== name) {
      await env.DB.prepare(
        `UPDATE chat_sessions SET name = ? WHERE id = ?`
      ).bind(name, canonicalId).run();
    }

    // Migrate any stray sessions/messages for this email into the canonical session
    const others = await env.DB.prepare(
      `SELECT id FROM chat_sessions
       WHERE lower(email) = lower(?) AND id != ?`
    ).bind(email, canonicalId).all();

    const otherIds = (others?.results || []).map(r => String(r.id));
    
    // Batch migrate sessions - process in parallel
    if (otherIds.length > 0) {
      await Promise.all(otherIds.map(async (sid) => {
        await env.DB.prepare(
          `UPDATE chat_messages SET session_id = ? WHERE session_id = ?`
        ).bind(canonicalId, sid).run();
        await env.DB.prepare(
          `DELETE FROM chat_sessions WHERE id = ?`
        ).bind(sid).run();
      }));
    }

    return json({ sessionId: canonicalId, reused: true });
  }

  // Create new session
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO chat_sessions (id, name, email) VALUES (?, ?, ?)`
  ).bind(sessionId, escapeHtml(name), escapeHtml(email)).run();

  return json({ sessionId, reused: false });
}

/**
 * Sync chat messages for a session
 */
export async function syncChat(env, url) {
  const sessionId = url.searchParams.get('sessionId');
  const sinceIdRaw = url.searchParams.get('sinceId') || '0';
  const sinceId = Number(sinceIdRaw) || 0;

  if (!sessionId) return json({ error: 'sessionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT id, role, content, created_at
     FROM chat_messages
     WHERE session_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT 100`
  ).bind(sessionId, sinceId).all();

  const messages = rows?.results || [];
  const lastId = messages.length ? messages[messages.length - 1].id : sinceId;

  return json({ messages, lastId });
}

/**
 * Send a message in a chat session
 */
export async function sendMessage(env, body, reqUrl) {
  const sessionId = String(body.sessionId || '').trim();
  const roleRaw = String(body.role || 'user').trim().toLowerCase();
  const rawContent = String(body.content ?? body.message ?? '');
  const role = ['user', 'admin', 'system'].includes(roleRaw) ? roleRaw : 'user';

  if (!sessionId) return json({ error: 'sessionId is required' }, 400);

  // Strict blocking: do not allow blocked sessions to send customer messages
  const sess = await env.DB.prepare(
    `SELECT blocked FROM chat_sessions WHERE id = ?`
  ).bind(sessionId).first();

  if (role === 'user' && Number(sess?.blocked || 0) === 1) {
    return json({ success: false, error: "You have been blocked by support." }, 403);
  }

  const trimmed = rawContent.trim();
  if (!trimmed) return json({ error: 'content is required' }, 400);

  // 500 char limit (backend)
  if (trimmed.length > 500) return json({ error: 'Message too long (max 500 characters)' }, 400);

  // Rate limit customers only (1 msg/sec)
  try {
    if (role === 'user') await enforceUserRateLimit(env, sessionId);
  } catch (e) {
    if (e?.status === 429) return json({ error: 'Too many messages. Please wait a moment.' }, 429);
    throw e;
  }

  // Determine if this is the user's first message
  let isFirstUserMessage = false;
  if (role === 'user') {
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as c
       FROM chat_messages
       WHERE session_id = ? AND role = 'user'`
    ).bind(sessionId).first();
    isFirstUserMessage = Number(countRow?.c || 0) === 0;
  }

  // XSS protection: escape before storing
  const safeContent = escapeHtml(trimmed);

  const insertRes = await env.DB.prepare(
    `INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)`
  ).bind(sessionId, role, safeContent).run();

  // Update denormalized last-message fields for fast admin listing
  try {
    await env.DB.prepare(
      `UPDATE chat_sessions
       SET last_message_content = ?, last_message_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(safeContent, sessionId).run();
  } catch (e) {
    console.error('Failed to update chat_sessions last-message fields:', e);
  }

  // Get session info for notifications
  let sessionName = '', sessionEmail = '';
  try {
    const sess2 = await env.DB.prepare('SELECT name, email FROM chat_sessions WHERE id = ?').bind(sessionId).first();
    sessionName = sess2?.name || '';
    sessionEmail = sess2?.email || '';
  } catch (e) {}

  // Notify admin about customer message (async)
  if (role === 'user') {
    notifyChatMessage(env, { 
      name: sessionName, 
      email: sessionEmail, 
      content: trimmed 
    }).catch(() => {});
  }
  
  // Notify customer about admin reply (async)
  if (role === 'admin' && sessionEmail) {
    notifyCustomerChatReply(env, { 
      name: sessionName, 
      email: sessionEmail, 
      replyContent: trimmed 
    }).catch(() => {});
  }

  // Trigger email alert webhook on first customer message (NON-BLOCKING)
  if (isFirstUserMessage) {
    try {
      const setting = await env.DB.prepare(
        `SELECT value FROM settings WHERE key = ?`
      ).bind('GOOGLE_SCRIPT_URL').first();

      const scriptUrl = String(setting?.value || '').trim();

      if (scriptUrl) {
        const session = await env.DB.prepare(
          `SELECT id, name, email, created_at FROM chat_sessions WHERE id = ?`
        ).bind(sessionId).first();

        // Fire-and-forget: don't await, use ctx.waitUntil if available
        const webhookPromise = fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'first_customer_message',
            sessionId,
            name: session?.name || null,
            email: session?.email || null,
            created_at: session?.created_at || null,
            message: trimmed
          })
        }).catch(e => console.error('Chat webhook failed:', e));
        
        // Use waitUntil if context available, otherwise fire-and-forget
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(webhookPromise);
        }
      }
    } catch (e) {
      console.error('Chat webhook trigger failed:', e);
    }
  }

  // Smart Quick Action Auto-Replies
  if (role === 'user') {
    const normalized = normalizeQuickAction(trimmed);
    const session = await env.DB.prepare(
      `SELECT email FROM chat_sessions WHERE id = ?`
    ).bind(sessionId).first();

    const email = String(session?.email || '').trim();
    const origin = new URL(reqUrl).origin;

    // "My Order Status"
    if (normalized === 'my order status') {
      let replyText = "We couldn't find any recent orders for this email.";

      if (email) {
        const lastOrder = await getLatestOrderForEmail(env, email);
        if (lastOrder) {
          const link = `${origin}/buyer-order.html?id=${encodeURIComponent(lastOrder.order_id)}`;
          replyText = `Your last order #${lastOrder.order_id} is currently ${lastOrder.status || 'unknown'}. Track it here: ${link}`;
        }
      }

      const safeReply = escapeHtml(replyText);
      await env.DB.prepare(
        `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'system', ?)`
      ).bind(sessionId, safeReply).run();

      try {
        await env.DB.prepare(
          `UPDATE chat_sessions
           SET last_message_content = ?, last_message_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(safeReply, sessionId).run();
      } catch (e) {}
    }

    // "Check Delivery Status"
    if (normalized === 'check delivery status') {
      let replyText = "No recent orders found for this email.";

      if (email) {
        const lastOrder = await getLatestOrderForEmail(env, email);
        if (lastOrder) {
          const link = `${origin}/buyer-order.html?id=${encodeURIComponent(lastOrder.order_id)}`;
          replyText = `Your last order is ${lastOrder.status || 'unknown'}. View details here: ${link}`;
        }
      }

      const safeReply = escapeHtml(replyText);
      await env.DB.prepare(
        `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'system', ?)`
      ).bind(sessionId, safeReply).run();

      try {
        await env.DB.prepare(
          `UPDATE chat_sessions
           SET last_message_content = ?, last_message_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(safeReply, sessionId).run();
      } catch (e) {}
    }
  }

  return json({ success: true, messageId: insertRes?.meta?.last_row_id || null });
}

/**
 * Block/unblock a chat session
 */
export async function blockSession(env, body) {
  const sessionId = String(body.sessionId || '').trim();
  const blocked = body.blocked === true || body.blocked === 1 || body.blocked === 'true';

  if (!sessionId) return json({ error: 'sessionId is required' }, 400);

  await env.DB.prepare(
    `UPDATE chat_sessions SET blocked = ? WHERE id = ?`
  ).bind(blocked ? 1 : 0, sessionId).run();

  return json({ success: true, blocked: blocked ? 1 : 0 });
}

/**
 * Delete a chat session and its messages
 */
export async function deleteSession(env, sessionId) {
  if (!sessionId) return json({ error: 'sessionId is required' }, 400);

  await env.DB.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).bind(sessionId).run();
  await env.DB.prepare(`DELETE FROM chat_sessions WHERE id = ?`).bind(sessionId).run();

  return json({ success: true });
}

/**
 * Get all chat sessions for admin
 */
export async function getSessions(env) {
  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       s.name,
       s.email,
       s.blocked,
       s.last_message_at,
       s.last_message_content AS last_message,
       s.created_at
     FROM chat_sessions s
     JOIN (
       SELECT lower(email) AS em, MIN(datetime(created_at)) AS min_created
       FROM chat_sessions
       GROUP BY lower(email)
     ) x
       ON lower(s.email) = x.em AND datetime(s.created_at) = x.min_created
     ORDER BY COALESCE(s.last_message_at, s.created_at) DESC
     LIMIT 200`
  ).all();

  return json({ sessions: rows?.results || [] });
}
