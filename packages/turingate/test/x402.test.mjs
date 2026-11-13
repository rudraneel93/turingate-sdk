// x402 + Turingate paywall, with a stubbed Turingate API and a stubbed x402 facilitator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentPaywall, toAtomic, b64json, unb64json } from '../lib/x402.js';

const PAY_TO = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
function stubs({ verify = { valid: true, reasons: [], claims: { aud: 's_test', agent_name: 'claude-code', prn_name: 'Ada', tier: 1, wal: OWNER } }, fv = { isValid: true, payer: OWNER }, fs = { success: true, payer: OWNER, transaction: '0xabc', network: 'eip155:8453' } } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null; calls.push({ url, body, headers: init?.headers });
    const reply = url.endsWith('/v1/verify') ? verify : url.endsWith('/verify') ? fv : fs;
    return new Response(JSON.stringify(typeof reply === 'function' ? reply(body) : reply), { status: 200 });
  };
  return { fetch, calls };
}
const mk = (s, extra = {}) => agentPaywall({ siteKey: 'rck_x', siteId: 's_test', price: '0.01', payTo: PAY_TO, fetch: s.fetch, server: 'https://tg.test', facilitator: 'https://fac.test', ...extra });
const req = (headers = {}) => ({ method: 'GET', url: 'https://api.example/report', headers });
const payment = (accepted) => b64json({ x402Version: 2, accepted, payload: { signature: '0xsig', authorization: { from: OWNER, to: PAY_TO, value: accepted.amount } } });

test('amount conversion', () => {
  assert.equal(toAtomic('0.01', 6), '10000'); assert.equal(toAtomic('2', 6), '2000000'); assert.equal(toAtomic('1.5', 6), '1500000');
  assert.throws(() => toAtomic('0.0000001', 6)); assert.throws(() => toAtomic('-1', 6));
});

test('no pass → 401 with WWW-Authenticate and the price up front', async () => {
  const r = await mk(stubs()).check(req());
  assert.equal(r.status, 401); assert.equal(r.headers['www-authenticate'], 'AgentPass site="s_test"');
  const pr = unb64json(r.headers['payment-required']); assert.equal(pr.x402Version, 2); assert.equal(pr.accepts[0].amount, '10000');
  assert.equal(pr.accepts[0].asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); assert.equal(pr.accepts[0].network, 'eip155:8453');
});

test('pass but no payment → 402 with x402 v2 PaymentRequired; spending limit checked in USDC', async () => {
  const s = stubs(); const r = await mk(s).check(req({ authorization: 'AgentPass a.b.c' }));
  assert.equal(r.status, 402);
  const pr = unb64json(r.headers['payment-required']);
  assert.equal(pr.resource.url, 'https://api.example/report'); assert.deepEqual(pr.accepts[0].extra, { name: 'USD Coin', version: '2' });
  assert.equal(pr.extensions.turingate.site, 's_test');
  assert.deepEqual(s.calls[0].body, { token: 'a.b.c', amount: 0.01, currency: 'USDC' });
});

test('valid pass + valid payment → verified, settled, PAYMENT-RESPONSE header set', async () => {
  const s = stubs(); const g = mk(s);
  const pr = unb64json((await g.check(req({ authorization: 'AgentPass a.b.c' }))).headers['payment-required']);
  const r = await g.check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': payment(pr.accepts[0]) }));
  assert.equal(r.ok, true); assert.equal(r.agent.owner, 'Ada'); assert.equal(r.payment.transaction, '0xabc');
  assert.equal(unb64json(r.headers['payment-response']).success, true);
  const fac = s.calls.filter((c) => c.url.startsWith('https://fac.test'));
  assert.deepEqual(fac.map((c) => c.url), ['https://fac.test/verify', 'https://fac.test/settle']);
  assert.equal(fac[0].body.x402Version, 2); assert.equal(fac[0].body.paymentRequirements.amount, '10000');
});

test('tampered terms, invalid payment or failed settlement → 402; rejected pass → 403', async () => {
  const s = stubs(); const g = mk(s);
  const base = { scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: PAY_TO };
  assert.equal((await g.check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': payment({ ...base, amount: '1' }) }))).status, 402);
  assert.equal((await g.check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': payment({ ...base, payTo: OWNER }) }))).status, 402);
  assert.equal((await mk(stubs({ fv: { isValid: false, invalidReason: 'insufficient_funds' } })).check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': payment(base) }))).status, 402);
  assert.equal((await mk(stubs({ fs: { success: false, errorReason: 'x' } })).check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': payment(base) }))).status, 402);
  assert.equal((await mk(stubs({ verify: { valid: false, reasons: ['amount 0.01 exceeds delegated limit 0 USD'] } })).check(req({ authorization: 'AgentPass a.b.c' }))).status, 403);
  assert.equal((await g.check(req({ authorization: 'AgentPass a.b.c', 'payment-signature': 'not-base64!' }))).status, 400);
});

test('requireOwnerWallet: payer must be the owner\'s linked wallet', async () => {
  const base = { scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: PAY_TO };
  const h = { authorization: 'AgentPass a.b.c', 'payment-signature': payment(base) };
  assert.equal((await mk(stubs(), { requireOwnerWallet: true }).check(req(h))).ok, true);
  assert.equal((await mk(stubs({ fv: { isValid: true, payer: '0x9999999999999999999999999999999999999999' } }), { requireOwnerWallet: true }).check(req(h))).status, 403);
  assert.equal((await mk(stubs({ verify: { valid: true, reasons: [], claims: { agent_name: 'x' } } }), { requireOwnerWallet: true }).check(req(h))).status, 403);
});

test('identity-only mode (no price) and x402 v1 compatibility', async () => {
  const s = stubs(); const free = agentPaywall({ siteKey: 'k', siteId: 's_test', scope: 'api:read', fetch: s.fetch, server: 'https://tg.test' });
  const r = await free.check(req({ authorization: 'AgentPass a.b.c' }));
  assert.equal(r.ok, true); assert.deepEqual(s.calls[0].body, { token: 'a.b.c', scope: 'api:read' });
  const v1 = mk(stubs(), { x402Version: 1, network: 'base-sepolia' });
  const r1 = await v1.check(req({ authorization: 'AgentPass a.b.c' }));
  assert.equal(r1.status, 402); assert.equal(r1.body.x402Version, 1); assert.equal(r1.body.accepts[0].network, 'base-sepolia');
  assert.equal(r1.body.accepts[0].maxAmountRequired, '10000'); assert.equal(r1.body.accepts[0].asset, '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
  const ok1 = await v1.check(req({ authorization: 'AgentPass a.b.c', 'x-payment': b64json({ x402Version: 1, scheme: 'exact', network: 'base-sepolia', payload: {} }) }));
  assert.equal(ok1.ok, true); assert.ok(ok1.headers['x-payment-response']);
});

test('Express-style middleware and fetch-style handler', async () => {
  const g = mk(stubs());
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await g({ method: 'GET', url: '/report', headers: { host: 'api.example' } }, res, () => { throw new Error('should not continue'); });
  assert.equal(res.statusCode, 401);
  const out = await g.handle(new Request('https://api.example/report', { headers: { authorization: 'AgentPass a.b.c' } }));
  assert.equal(out.response.status, 402); assert.ok(out.response.headers.get('payment-required'));
});
