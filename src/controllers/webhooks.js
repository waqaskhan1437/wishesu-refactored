/**
 * Universal Webhook System v3.0
 * Clean, Simple, Fast - Works with ANY automation service
 * 
 * Philosophy:
 * - Single webhook endpoint per event type
 * - Standard JSON payload format
 * - No email/SMS logic in worker - external services handle everything
 * - Low CPU usage, high reliability
 * 
 * Supported External Services:
 * - Make.com (recommended for email)
 * - n8n (self-hosted automation)
 * - Zapier (popular integrations)
 * - Custom webhooks (Slack, Discord, etc)
 */

import { json } from '../utils/response.js';

// Event types available for webhooks
export const EVENT_TYPES = {
  // Admin notifications
  ORDER_RECEIVED: 'order.received',
  ORDER_DELIVERED: 'order.delivered',
  TIP_RECEIVED: 'tip.received',
  REVIEW_SUBMITTED: 'review.submitted',
  BLOG_COMMENT: 'blog.comment',
  FORUM_QUESTION: 'forum.question',
  FORUM_REPLY: 'forum.reply',
  CHAT_MESSAGE: 'chat.message',
  BACKUP_CREATED: 'backup.created',
  // Revision events
  ORDER_REVISION_REQUESTED: 'order.revision_requested',
  
  // Customer notifications
  CUSTOMER_ORDER_CONFIRMED: 'customer.order.confirmed',
  CUSTOMER_ORDER_DELIVERED: 'customer.order.delivered',
  CUSTOMER_CHAT_REPLY: 'customer.chat.reply',
  CUSTOMER_FORUM_REPLY: 'customer.forum.reply'
};

// In-memory cache for webhooks config
let webhooksCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get webhooks configuration
 */
async function getWebhooksConfig(env, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && webhooksCache && (now - cacheTime) < CACHE_TTL) {
    return webhooksCache;
  }
  
  try {
    const row = await env.DB.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind('webhooks_config').first();
    
    if (row?.value) {
      webhooksCache = JSON.parse(row.value);
    } else {
      webhooksCache = getDefaultConfig();
    }
    
    cacheTime = now;
    return webhooksCache;
  } catch (e) {
    console.error('Failed to load webhooks config:', e);
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    enabled: false,
    endpoints: [] // Array of { id, name, url, events[], secret, enabled }
  };
}

/**
 * Save webhooks configuration
 */
async function saveWebhooksConfig(env, config) {
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).bind('webhooks_config', JSON.stringify(config)).run();
    
    webhooksCache = config;
    cacheTime = Date.now();
    return true;
  } catch (e) {
    console.error('Failed to save webhooks config:', e);
    return false;
  }
}

/**
 * API: Get webhooks settings
 */
export async function getWebhooksSettings(env) {
  try {
    const config = await getWebhooksConfig(env, true);
    
    // Mask secrets for security
    const safeConfig = {
      ...config,
      endpoints: (config.endpoints || []).map(e => ({
        ...e,
        secret: e.secret ? '••••••••' : ''
      }))
    };
    
    return json({ success: true, config: safeConfig });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * API: Save webhooks settings
 */
export async function saveWebhooksSettings(env, body) {
  try {
    const currentConfig = await getWebhooksConfig(env, true);
    const newConfig = body.config || body;
    
    // Preserve masked secrets
    if (newConfig.endpoints) {
      newConfig.endpoints = newConfig.endpoints.map(e => {
        if (e.secret === '••••••••') {
          const existing = currentConfig.endpoints?.find(x => x.id === e.id);
          e.secret = existing?.secret || '';
        }
        return e;
      });
    }
    
    const success = await saveWebhooksConfig(env, newConfig);
    return json({ success });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/**
 * Create standard webhook payload
 */
function createPayload(event, data) {
  return {
    event,
    timestamp: new Date().toISOString(),
    data,
    // Metadata for webhook receivers
    meta: {
      version: '3.0',
      source: 'wishesu'
    }
  };
}

/**
 * Send webhook to single endpoint
 */
async function sendWebhook(endpoint, payload) {
  if (!endpoint.enabled || !endpoint.url) {
    return { success: false, error: 'Endpoint disabled or missing URL' };
  }
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'WishesU-Webhook/3.0'
    };
    
    // Add authentication if secret is configured
    if (endpoint.secret) {
      headers['X-Webhook-Secret'] = endpoint.secret;
      
      // Also add signature for extra security (HMAC-SHA256)
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(payload));
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(endpoint.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, data);
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      headers['X-Webhook-Signature'] = signatureHex;
    }
    
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    return {
      success: response.ok,
      status: response.status,
      response: responseText
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Dispatch event to all subscribed webhooks
 */
export async function dispatch(env, event, data) {
  const config = await getWebhooksConfig(env);
  
  if (!config.enabled) {
    return { success: false, error: 'Webhooks disabled' };
  }
  
  // Find all endpoints subscribed to this event
  const endpoints = (config.endpoints || []).filter(e => 
    e.enabled && Array.isArray(e.events) && e.events.includes(event)
  );
  
  if (endpoints.length === 0) {
    return { success: true, message: 'No endpoints subscribed to this event' };
  }
  
  // Create payload
  const payload = createPayload(event, data);
  
  // Send to all subscribed endpoints in parallel
  const results = await Promise.allSettled(
    endpoints.map(e => sendWebhook(e, payload))
  );
  
  // Log failures only (saves DB operations)
  const failures = results.filter((r, i) => 
    r.status === 'rejected' || !r.value?.success
  );
  
  if (failures.length > 0) {
    console.error('Webhook failures:', failures);
  }
  
  return {
    success: true,
    sent: results.length,
    failed: failures.length
  };
}

// =====================================================
// CONVENIENCE FUNCTIONS FOR EACH EVENT TYPE
// =====================================================

export async function notifyOrderReceived(env, orderData) {
  return dispatch(env, EVENT_TYPES.ORDER_RECEIVED, {
    orderId: orderData.orderId || orderData.order_id,
    productId: orderData.productId || orderData.product_id,
    productTitle: orderData.productTitle || orderData.product_title,
    customerName: orderData.customerName || orderData.customer_name,
    customerEmail: orderData.customerEmail || orderData.email,
    amount: orderData.amount || orderData.total,
    currency: orderData.currency || 'USD',
    paymentMethod: orderData.paymentMethod || orderData.payment_method,
    createdAt: orderData.createdAt || orderData.created_at || new Date().toISOString()
  });
}

export async function notifyOrderDelivered(env, orderData) {
  return dispatch(env, EVENT_TYPES.ORDER_DELIVERED, {
    orderId: orderData.orderId || orderData.order_id,
    productTitle: orderData.productTitle || orderData.product_title,
    customerName: orderData.customerName || orderData.customer_name,
    deliveryUrl: orderData.deliveryUrl || orderData.delivery_url,
    videoUrl: orderData.videoUrl || orderData.video_url,
    deliveredAt: new Date().toISOString()
  });
}

export async function notifyTipReceived(env, tipData) {
  return dispatch(env, EVENT_TYPES.TIP_RECEIVED, {
    amount: tipData.amount,
    currency: tipData.currency || 'USD',
    senderName: tipData.name || tipData.sender_name || 'Anonymous',
    message: tipData.message || '',
    receivedAt: new Date().toISOString()
  });
}

export async function notifyReviewSubmitted(env, reviewData) {
  return dispatch(env, EVENT_TYPES.REVIEW_SUBMITTED, {
    productId: reviewData.productId || reviewData.product_id,
    productTitle: reviewData.productTitle || reviewData.product_title,
    customerName: reviewData.customerName || reviewData.author_name,
    rating: reviewData.rating,
    comment: reviewData.comment || reviewData.review_text,
    submittedAt: new Date().toISOString()
  });
}

export async function notifyBlogComment(env, commentData) {
  return dispatch(env, EVENT_TYPES.BLOG_COMMENT, {
    blogId: commentData.blogId || commentData.blog_id,
    blogTitle: commentData.blogTitle || commentData.post_title,
    authorName: commentData.authorName || commentData.author_name,
    authorEmail: commentData.authorEmail || commentData.email,
    comment: commentData.comment || commentData.content,
    submittedAt: new Date().toISOString()
  });
}

export async function notifyForumQuestion(env, questionData) {
  return dispatch(env, EVENT_TYPES.FORUM_QUESTION, {
    questionId: questionData.id,
    title: questionData.title,
    content: questionData.content || questionData.body,
    authorName: questionData.authorName || questionData.author_name || questionData.name,
    authorEmail: questionData.authorEmail || questionData.email,
    url: questionData.url,
    submittedAt: new Date().toISOString()
  });
}

export async function notifyForumReply(env, replyData) {
  return dispatch(env, EVENT_TYPES.FORUM_REPLY, {
    questionId: replyData.questionId || replyData.question_id,
    questionTitle: replyData.questionTitle || replyData.question_title,
    replyId: replyData.id,
    content: replyData.content || replyData.body,
    authorName: replyData.authorName || replyData.author_name || replyData.name,
    authorEmail: replyData.authorEmail || replyData.email,
    submittedAt: new Date().toISOString()
  });
}

export async function notifyChatMessage(env, messageData) {
  return dispatch(env, EVENT_TYPES.CHAT_MESSAGE, {
    sessionId: messageData.sessionId || messageData.session_id,
    senderName: messageData.senderName || messageData.sender_name,
    senderEmail: messageData.senderEmail || messageData.email,
    message: messageData.message || messageData.content,
    sentAt: new Date().toISOString()
  });
}

export async function notifyCustomerOrderConfirmed(env, orderData) {
  return dispatch(env, EVENT_TYPES.CUSTOMER_ORDER_CONFIRMED, {
    orderId: orderData.orderId || orderData.order_id,
    productTitle: orderData.productTitle || orderData.product_title,
    customerName: orderData.customerName || orderData.customer_name,
    customerEmail: orderData.customerEmail || orderData.email,
    amount: orderData.amount || orderData.total,
    trackingUrl: orderData.trackingUrl || orderData.tracking_url
  });
}

export async function notifyCustomerOrderDelivered(env, orderData) {
  return dispatch(env, EVENT_TYPES.CUSTOMER_ORDER_DELIVERED, {
    orderId: orderData.orderId || orderData.order_id,
    productTitle: orderData.productTitle || orderData.product_title,
    customerName: orderData.customerName || orderData.customer_name,
    customerEmail: orderData.customerEmail || orderData.email,
    deliveryUrl: orderData.deliveryUrl || orderData.delivery_url,
    videoUrl: orderData.videoUrl || orderData.video_url
  });
}

export async function notifyCustomerChatReply(env, chatData) {
  return dispatch(env, EVENT_TYPES.CUSTOMER_CHAT_REPLY, {
    customerName: chatData.customerName || chatData.customer_name,
    customerEmail: chatData.customerEmail || chatData.customer_email,
    replyMessage: chatData.replyMessage || chatData.reply,
    chatUrl: chatData.chatUrl
  });
}

export async function notifyCustomerForumReply(env, forumData) {
  return dispatch(env, EVENT_TYPES.CUSTOMER_FORUM_REPLY, {
    questionTitle: forumData.questionTitle || forumData.question_title,
    customerName: forumData.customerName || forumData.customer_name,
    customerEmail: forumData.customerEmail || forumData.customer_email,
    replyContent: forumData.replyContent || forumData.reply,
    questionUrl: forumData.questionUrl
  });
}

/**
 * Notify that an order revision has been requested.  This event is primarily
 * for admin notifications when a customer requests changes to their order.
 *
 * @param {Object} env Environment bindings
 * @param {Object} revisionData Contains order and revision details
 * @returns {Promise<Object>} Dispatch result
 */
export async function notifyOrderRevisionRequested(env, revisionData) {
  return dispatch(env, EVENT_TYPES.ORDER_REVISION_REQUESTED, {
    orderId: revisionData.orderId || revisionData.order_id,
    productTitle: revisionData.productTitle || revisionData.product_title,
    customerName: revisionData.customerName || revisionData.customer_name,
    customerEmail: revisionData.customerEmail || revisionData.email,
    revisionReason: revisionData.revisionReason || revisionData.revision_reason,
    revisionCount: revisionData.revisionCount || revisionData.revision_count,
    status: revisionData.status || 'revision',
    submittedAt: new Date().toISOString()
  });
}

// =====================================================
// TEST ENDPOINT
// =====================================================

export async function testWebhook(env, endpointId) {
  const config = await getWebhooksConfig(env, true);
  const endpoint = (config.endpoints || []).find(e => e.id === endpointId);
  
  if (!endpoint) {
    return json({ success: false, error: 'Endpoint not found' });
  }
  
  const testPayload = createPayload('test.webhook', {
    message: 'This is a test webhook from WishesU',
    testId: Date.now(),
    note: 'If you see this, your webhook is working correctly!'
  });
  
  const result = await sendWebhook({ ...endpoint, enabled: true }, testPayload);
  return json(result);
}

// Export aliases for backward compatibility
export { notifyOrderReceived as notifyNewOrder };
export { notifyTipReceived as notifyNewTip };
export { notifyReviewSubmitted as notifyNewReview };
export { notifyBlogComment as notifyNewBlogComment };
export { notifyForumQuestion as notifyNewForumQuestion };
export { notifyForumReply as notifyNewForumReply };
export { notifyChatMessage as notifyNewChatMessage };
