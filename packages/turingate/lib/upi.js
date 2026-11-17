// India: verified AI agents pay by UPI, within their owner's rupee spending limit.
// The site uses its OWN Razorpay account (Turingate never touches money). Flow:
//   1. the agent presents a Turingate pass;  2. the amount is checked against the owner's INR limit and scope;
//   3. a Razorpay Payment Link (UPI) is created;  4. the agent hands the link to its owner, who approves in their UPI app;
//   5. Razorpay's webhook (payment_link.paid) confirms payment.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPass } from './verify.js';
import { DEFAULT_SERVER } from './client.js';

const RZP = 'https://api.razorpay.com/v1';

export function upiCheckout({ keyId, keySecret, siteKey, scope = 'shop:checkout', upiOnly = false, server = DEFAULT_SERVER, fetchImpl = fetch, verify = verifyPass } = {}) {
  if (!keyId || !keySecret) throw new Error('keyId and keySecret (your Razorpay API keys) are required');
  if (!siteKey) throw new Error('siteKey (from the Turingate Console) is required');
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const rzp = async (path, init = {}) => {
    const r = await fetchImpl(`${RZP}${path}`, { ...init, headers: { authorization: auth, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Razorpay: ${j.error?.description || `HTTP ${r.status}`}`);
    return j;
  };

  return {
    /**
     * Verify the agent's pass for this amount, then create a UPI payment link for its owner to approve.
     * amount is in rupees (e.g. 499.5). Returns { ok, link, id, amount, owner, agent } or { ok:false, reasons }.
     */
    async create({ token, amount, description = 'Order', referenceId, customer, callbackUrl, expireInMinutes = 30, notifyOwner = false } = {}) {
      const rupees = Number(amount);
      if (!(rupees > 0)) throw new Error('amount (in rupees) must be positive');
      const v = await verify(token, { siteKey, scope, amount: rupees, currency: 'INR', requireBound: true, server });
      if (!v.valid) return { ok: false, reasons: v.reasons };
      const c = v.claims ?? {};
      const body = {
        amount: Math.round(rupees * 100), currency: 'INR', description: String(description).slice(0, 2048), accept_partial: false,
        expire_by: Math.floor(Date.now() / 1000) + Math.max(16, expireInMinutes) * 60,
        reference_id: referenceId ? String(referenceId).slice(0, 40) : undefined,
        customer: customer ? { name: customer.name, email: customer.email, contact: customer.contact } : (c.prn_name ? { name: String(c.prn_name).slice(0, 100) } : undefined),
        notify: { sms: !!(notifyOwner && customer?.contact), email: !!(notifyOwner && customer?.email) },
        reminder_enable: false,
        notes: { turingate_agent: String(c.agent_name ?? c.sub ?? '').slice(0, 250), turingate_owner: String(c.prn_name ?? '').slice(0, 250), turingate_pass: String(c.jti ?? '').slice(0, 250) },
        ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
        ...(upiOnly ? { upi_link: true } : {}),
      };
      const link = await rzp('/payment_links', { method: 'POST', body: JSON.stringify(body) });
      return { ok: true, id: link.id, link: link.short_url, status: link.status, amount: rupees, currency: 'INR', agent: c.agent_name ?? null, owner: c.prn_name ?? null };
    },

    /** Current status of a payment link: created | paid | partially_paid | expired | cancelled */
    async status(id) { const l = await rzp(`/payment_links/${encodeURIComponent(id)}`); return { id: l.id, status: l.status, amountPaid: (l.amount_paid ?? 0) / 100 }; },
  };
}

/** Verify a Razorpay webhook (X-Razorpay-Signature) against your webhook secret, using the RAW request body. */
export function verifyRazorpayWebhook(rawBody, signature, webhookSecret) {
  if (!signature || !webhookSecret) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
