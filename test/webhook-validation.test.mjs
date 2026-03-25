import test from 'node:test';
import assert from 'node:assert/strict';

import { routeApiRequest, validateWebhookRequestPayload } from '../src/router.js';

test('validateWebhookRequestPayload rejects empty webhook payloads', () => {
  assert.equal(
    validateWebhookRequestPayload('whop', {}),
    'Webhook payload must be a non-empty JSON object'
  );
  assert.equal(
    validateWebhookRequestPayload('paypal', {}),
    'Webhook payload must be a non-empty JSON object'
  );
  assert.equal(
    validateWebhookRequestPayload('universal', {}),
    'Webhook payload must be a non-empty JSON object'
  );
});

test('validateWebhookRequestPayload enforces required Whop and PayPal fields', () => {
  assert.equal(
    validateWebhookRequestPayload('whop', { type: 'payment.succeeded', data: {} }),
    'Whop webhook data required'
  );
  assert.equal(
    validateWebhookRequestPayload('paypal', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }),
    'PayPal webhook resource required'
  );
  assert.equal(
    validateWebhookRequestPayload('universal', { type: 'payment.succeeded', data: {} }),
    'Whop webhook data required'
  );
  assert.equal(
    validateWebhookRequestPayload('universal', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }),
    'PayPal webhook resource required'
  );
});

test('routeApiRequest returns 400 for empty webhook posts before DB work', async () => {
  const cases = [
    '/api/whop/webhook',
    '/api/paypal/webhook',
    '/api/payment/universal/webhook'
  ];

  for (const path of cases) {
    const request = new Request(`https://example.com${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const url = new URL(request.url);
    const response = await routeApiRequest(request, {}, url, url.pathname, request.method);
    assert.equal(response.status, 400);
  }
});

test('routeApiRequest returns 400 for structurally incomplete webhook payloads', async () => {
  const cases = [
    ['/api/whop/webhook', '{"type":"payment.succeeded","data":{}}'],
    ['/api/paypal/webhook', '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{}}'],
    ['/api/payment/universal/webhook', '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{}}']
  ];

  for (const [path, body] of cases) {
    const request = new Request(`https://example.com${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    const url = new URL(request.url);
    const response = await routeApiRequest(request, {}, url, url.pathname, request.method);
    assert.equal(response.status, 400);
  }
});
