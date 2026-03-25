# Universal Webhook System v3.0 - Setup Guide

## 🎉 System Overview

Bilkul **Shopify-style webhook system** - simple aur flexible!

### Key Features
```
✓ Add unlimited webhook URLs
✓ Each URL has its own event permissions  
✓ Works with ANY service (no vendor lock-in)
✓ Zero worker activity if no webhooks configured
✓ Standard JSON payload format
✓ HMAC signature support for security
```

### Works With
- Google Apps Script (for Gmail notifications)
- Make.com / Zapier / n8n (automation platforms)
- Slack / Discord (team notifications)
- Your own API endpoint
- ANY HTTP endpoint that accepts JSON

---

## 🚀 Quick Setup (2 Minutes)

### Step 1: Get Your Webhook URL

Apne service se webhook URL get karein:

**Example 1: Google Apps Script (Free Gmail notifications)**
```
URL: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

**Example 2: Your Custom API**
```
URL: https://your-api.com/webhooks/orders
```

**Example 3: Slack**
```
URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Example 4: Discord**
```
URL: https://discord.com/api/webhooks/YOUR_WEBHOOK_ID
```

---

### Step 2: Admin Dashboard Setup

1. **Login to Admin Dashboard**
   ```
   https://your-domain.com/admin
   ```

2. **Open Webhooks Settings**
   - Click **"⚡ Webhooks"** button
   - Enable: **"Enable Webhooks System"** ✅

3. **Add Webhook URL**
   - Click **"+ Add Endpoint"**
   - **Name:** `Gmail Notifications` (koi bhi naam)
   - **URL:** Paste your webhook URL
   - **Secret:** (optional - for security verification)
   - **Select Events:** Check the events you want
     - ✅ Order Received (new orders)
     - ✅ Tip Received (tips)
     - ✅ Review Submitted (reviews)
     - etc.
   - Click **"Save Changes"**

4. **Test Webhook**
   - Click **"🧪 Test"** button
   - Check your endpoint received the test data
   - ✅ If successful, you're done!

---

## 📋 Available Events

Har event ke liye alag webhook URL add kar sakte ho, ya ek URL ko multiple events assign kar sakte ho:

### Admin Notifications (for site owner)
| Event | When Triggered | Data Included |
|-------|----------------|---------------|
| **Order Received** | Customer places order | orderId, customerName, email, amount, productTitle |
| **Order Delivered** | Admin marks order complete | orderId, customerName, deliveryUrl, videoUrl |
| **Tip Received** | Customer sends tip | amount, senderName, message |
| **Review Submitted** | Customer posts review | productTitle, rating, comment, customerName |
| **Blog Comment** | User comments on blog | blogTitle, authorName, comment |
| **Forum Question** | User asks question | title, content, authorName |
| **Forum Reply** | User replies to question | questionTitle, replyContent, authorName |
| **Chat Message** | Customer sends chat | senderName, message |

### Customer Notifications (auto-reply to customers)
| Event | When Triggered | Data Included |
|-------|----------------|---------------|
| **Order Confirmed** | Payment successful | orderId, customerEmail, productTitle, amount |
| **Order Delivered** | Video ready | orderId, customerEmail, deliveryUrl |
| **Chat Reply** | Admin replies | customerEmail, replyMessage |
| **Forum Reply** | Someone replies | customerEmail, questionTitle, reply |

---

## 🔧 Setup Examples

### Example 1: Google Apps Script (Free Gmail Emails)

**Step 1: Create Google Apps Script**
1. Go to https://script.google.com
2. New Project → Paste this code:

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const event = data.event;
    const payload = data.data;
    
    // Send email based on event
    let subject = '';
    let body = '';
    let recipient = '';
    
    if (event === 'order.received') {
      recipient = 'admin@prankwish.com';
      subject = '🎉 New Order #' + payload.orderId;
      body = `
New Order Received!

Order ID: ${payload.orderId}
Customer: ${payload.customerName}
Email: ${payload.customerEmail}
Product: ${payload.productTitle}
Amount: $${payload.amount}

Login to admin panel to view details.
      `;
    } 
    else if (event === 'customer.order.confirmed') {
      recipient = payload.customerEmail;
      subject = '✅ Order Confirmed - ' + payload.productTitle;
      body = `
Hi ${payload.customerName}!

Thank you for your order!

Order ID: ${payload.orderId}
Product: ${payload.productTitle}
Amount: $${payload.amount}

We'll notify you when your video is ready!

Best regards,
Your Team
      `;
    }
    
    if (recipient && subject) {
      MailApp.sendEmail(recipient, subject, body);
    }
    
    return ContentService.createTextOutput(JSON.stringify({success: true}));
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.message}));
  }
}
```

3. **Deploy:**
   - Click **Deploy** → New deployment
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → Copy URL

4. **Add to Admin Dashboard:**
   - URL: Paste Google Script URL
   - Events: Select `Order Received`, `Order Confirmed`
   - Save!

---

### Example 2: Multiple Webhooks for Different Purposes

**Scenario:** Different URLs for different tasks

```
Webhook 1: Gmail Notifications
  URL: https://script.google.com/macros/s/.../exec
  Events: ✅ Order Received, ✅ Tip Received
  
Webhook 2: Slack Team Alerts  
  URL: https://hooks.slack.com/services/.../
  Events: ✅ Order Received, ✅ Review Submitted

Webhook 3: Custom CRM Integration
  URL: https://your-crm.com/api/webhooks
  Events: ✅ Order Received, ✅ Order Delivered
  Secret: your-secret-key-123

Webhook 4: Discord Community
  URL: https://discord.com/api/webhooks/.../
  Events: ✅ Forum Question, ✅ Forum Reply
```

Har webhook independently kaam karega sirf apni selected events ke liye!

---

### Example 3: Custom API Endpoint

Apna khud ka endpoint banayein:

```javascript
// Node.js Express example
app.post('/webhooks/wishesu', (req, res) => {
  const { event, data, timestamp } = req.body;
  
  // Verify signature (optional but recommended)
  const signature = req.headers['x-webhook-signature'];
  const secret = req.headers['x-webhook-secret'];
  
  if (secret !== 'your-secret-key') {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  
  // Process event
  switch(event) {
    case 'order.received':
      // Send email via your email service
      await sendEmail(data.customerEmail, 'Order Confirmed', ...);
      // Update your database
      await db.orders.create(data);
      break;
      
    case 'tip.received':
      // Send SMS notification
      await sendSMS('+1234567890', `New tip: $${data.amount}`);
      break;
      
    default:
      console.log('Unhandled event:', event);
  }
  
  res.json({ success: true });
});
```

---

## 📤 Webhook Payload Format

Har webhook ko yeh standard JSON milta hai:

```json
{
  "event": "order.received",
  "timestamp": "2026-01-21T12:30:00.000Z",
  "data": {
    "orderId": "ORD-12345",
    "productId": 1,
    "productTitle": "Birthday Video",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "amount": 25.00,
    "currency": "USD",
    "paymentMethod": "stripe",
    "createdAt": "2026-01-21T12:30:00.000Z"
  },
  "meta": {
    "version": "3.0",
    "source": "wishesu"
  }
}
```

### Event-specific Data

**order.received:**
```json
{
  "orderId": "ORD-123",
  "productTitle": "Product Name",
  "customerName": "John Doe",
  "customerEmail": "john@email.com",
  "amount": 25.00,
  "currency": "USD"
}
```

**tip.received:**
```json
{
  "amount": 10.00,
  "currency": "USD",
  "senderName": "John Doe",
  "message": "Great service!"
}
```

**review.submitted:**
```json
{
  "productTitle": "Product Name",
  "customerName": "John Doe",
  "rating": 5,
  "comment": "Amazing product!"
}
```

---

## 🔒 Security (Optional but Recommended)

### Option 1: Secret Header Verification

Admin mein secret set karein:
```
Secret: my-secure-secret-key-123
```

Aapke endpoint par:
```javascript
const secret = req.headers['x-webhook-secret'];
if (secret !== 'my-secure-secret-key-123') {
  return res.status(401).send('Unauthorized');
}
```

### Option 2: HMAC Signature Verification

System automatically HMAC-SHA256 signature bhejta hai:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expected = hmac.digest('hex');
  return signature === expected;
}

// Usage
const signature = req.headers['x-webhook-signature'];
const isValid = verifySignature(req.body, signature, 'your-secret');

if (!isValid) {
  return res.status(401).send('Invalid signature');
}
```

---

## ⚡ Performance & Zero Activity

### Smart Design
```
❌ No webhooks configured = Zero worker activity
✅ Webhooks configured = Only subscribed events trigger
✅ Multiple webhooks = Parallel execution (fast)
✅ Failed webhooks = Don't block other webhooks
```

### What Happens When:

**Scenario 1: No webhooks added**
```
User places order → Worker processes → No webhook calls → Fast response
```

**Scenario 2: One webhook, selected events only**
```
User places order → Worker sends to Webhook 1 (if order.received selected)
User posts review → Worker sends to Webhook 1 (if review.submitted selected)
User sends chat → No webhook call (if chat.message not selected)
```

**Scenario 3: Multiple webhooks**
```
User places order → All parallel:
  - Webhook 1 (Gmail) gets notification
  - Webhook 2 (Slack) gets notification  
  - Webhook 3 (CRM) gets notification
  - All run simultaneously (non-blocking)
```

---

## 🧪 Testing

### Test Button
1. Admin → Webhooks
2. Click **"🧪 Test"** on any webhook
3. Receives test payload:
```json
{
  "event": "test.webhook",
  "timestamp": "...",
  "data": {
    "message": "This is a test webhook from WishesU",
    "testId": 1234567890,
    "note": "If you see this, your webhook is working!"
  }
}
```

### Live Testing
1. Place a test order on your site
2. Check your webhook endpoint logs
3. Verify data received correctly

---

## 🔍 Troubleshooting

### Webhook not receiving data?

**✅ Check 1: Master toggle enabled?**
```
Admin → Webhooks → "Enable Webhooks System" = ON
```

**✅ Check 2: Specific endpoint enabled?**
```
Each webhook has enable toggle - must be ON
```

**✅ Check 3: Events selected?**
```
At least one event must be checked
```

**✅ Check 4: URL correct?**
```
Copy-paste carefully, no extra spaces
Must be valid HTTP/HTTPS URL
```

**✅ Check 5: Endpoint accessible?**
```
Test URL in browser or Postman
Should accept POST requests
```

### Webhook receiving but not processing?

**✅ Check your endpoint code**
```
console.log(req.body) to see received data
Check for errors in your service logs
```

**✅ Check response status**
```
Your endpoint should return 200 OK
Non-200 responses are logged as failures
```

---

## 📊 Best Practices

### ✅ DO:
1. **Use HTTPS URLs only** (secure)
2. **Set secret keys** for sensitive webhooks
3. **Test before going live** (test button)
4. **One webhook = One purpose** (easier debugging)
5. **Return 200 OK quickly** (avoid timeouts)

### ❌ DON'T:
1. **Use HTTP** (insecure)
2. **Share webhook URLs publicly** (security risk)
3. **Block webhook response** (keep processing fast)
4. **Forget to handle errors** (graceful failures)

---

## 🎯 Common Use Cases

### Use Case 1: Simple Email Notifications
```
1 Webhook → Google Apps Script → Gmail
Events: All admin notifications
Purpose: Get email on every important event
```

### Use Case 2: Team Notifications
```
1 Webhook → Slack
Events: Order Received, Tip Received
Purpose: Team knows about new sales instantly
```

### Use Case 3: Customer Auto-reply
```
1 Webhook → Google Script → Customer Email
Events: Order Confirmed, Order Delivered
Purpose: Automatic confirmation/delivery emails
```

### Use Case 4: Advanced Integration
```
Webhook 1 → Gmail (admin notifications)
Webhook 2 → Slack (team alerts)
Webhook 3 → Custom CRM (order sync)
Webhook 4 → Discord (community updates)
Each with specific event permissions
```

---

## 📝 Summary

### What You Have Now:
1. ✅ **Flexible webhook system** - add unlimited URLs
2. ✅ **Event permissions** - each URL chooses events
3. ✅ **Zero overhead** - only active when configured
4. ✅ **Parallel execution** - multiple webhooks run together
5. ✅ **Service agnostic** - works with anything
6. ✅ **Secure** - HMAC signatures + secret keys
7. ✅ **Simple UI** - Shopify-style configuration

### Benefits:
- 🚀 **Fast** - no email logic in worker
- 🔧 **Flexible** - use any service you want
- 💰 **Free** - use Google Script for free emails
- 🎯 **Focused** - each webhook has specific job
- 🛡️ **Secure** - signatures + secrets supported

---

**Last Updated:** 2026-01-21  
**Version:** 3.0  
**Status:** Production Ready ✅
