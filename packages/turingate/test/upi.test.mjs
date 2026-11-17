import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { upiCheckout, verifyRazorpayWebhook } from '../index.js';

const okPass = async (token, o) => (token === 'good' && o.currency === 'INR' && o.amount <= 5000 && o.requireBound
  ? { valid: true, reasons: [], claims: { agent_name: 'trip-planner', prn_name: 'Ada Lovelace', jti: 'j1' } }
  : { valid: false, reasons: ['amount exceeds the owner\'s spending limit'] });

test('creates a UPI payment link only for a verified pass within the INR limit', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body ?? '{}') }); return { ok: true, json: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created' }) }; };
  const co = upiCheckout({ keyId: 'rzp_test_x', keySecret: 's', siteKey: 'k', upiOnly: true, fetchImpl, verify: okPass });
  const r = await co.create({ token: 'good', amount: 1499.5, description: 'Hotel deposit', referenceId: 'ord_9' });
  assert.equal(r.ok, true); assert.equal(r.link, 'https://rzp.io/i/abc'); assert.equal(r.owner, 'Ada Lovelace');
  const b = calls[0].body;
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/payment_links');
  assert.equal(b.amount, 149950); assert.equal(b.currency, 'INR'); assert.equal(b.upi_link, true); assert.equal(b.reference_id, 'ord_9');
  assert.equal(b.notes.turingate_owner, 'Ada Lovelace');
  assert.match(calls[0].init.headers.authorization, /^Basic /);
  const over = await co.create({ token: 'good', amount: 9000 });
  assert.equal(over.ok, false); assert.match(over.reasons[0], /limit/);
  assert.equal(calls.length, 1, 'no link is created when the pass is refused');
});

test('Razorpay webhook signatures', () => {
  const raw = '{"event":"payment_link.paid"}';
  const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');
  assert.equal(verifyRazorpayWebhook(raw, sig, 'whsec'), true);
  assert.equal(verifyRazorpayWebhook(raw, sig, 'other'), false);
  assert.equal(verifyRazorpayWebhook(raw, undefined, 'whsec'), false);
});
