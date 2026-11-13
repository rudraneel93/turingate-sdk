// Runs the gate with a stubbed origin and a stubbed Turingate API (set REAL_TURINGATE=url and PASS=... to hit a real one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gate, { matchPath } from './src/index.js';

const env = { TURINGATE_SITE_ID: 's_0123456789abcdef', TURINGATE_SITE_KEY: 'rck_test', PROTECT_PATHS: '/api/*', AGENTS_ONLY_PATHS: '/agent-api/*', WRITE_SCOPE: 'api:write', TURINGATE_SERVER: 'https://tg.test' };
let lastOrigin = null; let verifyReply = null;
globalThis.fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  if (req.url.startsWith('https://tg.test/')) {
    assert.equal(req.headers.get('x-site-key'), 'rck_test');
    return new Response(JSON.stringify(typeof verifyReply === 'function' ? verifyReply(await req.json()) : verifyReply), { status: 200 });
  }
  lastOrigin = req;
  return new Response('origin ok');
};
const call = (path, { method = 'GET', headers = {} } = {}) => gate.fetch(new Request(`https://shop.example${path}`, { method, headers }), env);

test('path matching', () => {
  assert.ok(matchPath('/api/x', '/api/*')); assert.ok(matchPath('/checkout', '/api/*, /checkout')); assert.ok(!matchPath('/apis', '/api/*,/checkout'));
});

test('humans and unprotected paths pass straight through; spoofed headers are stripped', async () => {
  const r = await call('/about', { headers: { 'x-turingate-agent': 'fake', 'x-turingate-verified': '1' } });
  assert.equal(await r.text(), 'origin ok');
  assert.equal(lastOrigin.headers.get('x-turingate-agent'), null); assert.equal(lastOrigin.headers.get('x-turingate-verified'), null);
  assert.equal(await (await call('/api/products')).text(), 'origin ok');
});

test('agents-only paths ask for a pass', async () => {
  const r = await call('/agent-api/orders');
  assert.equal(r.status, 401); assert.equal(r.headers.get('www-authenticate'), 'AgentPass site="s_0123456789abcdef"');
});

test('valid pass: origin receives who sent the agent; scope sent for writes', async () => {
  let seen;
  verifyReply = (b) => { seen = b; return { valid: true, reasons: [], claims: { aud: 's_0123456789abcdef', agent_name: 'claude-code', sub: 'a_x', prn_name: 'Ada', tier: 2, scopes: ['api:write'] } }; };
  const r = await call('/api/orders', { method: 'POST', headers: { authorization: 'AgentPass a.b.c' } });
  assert.equal(await r.text(), 'origin ok'); assert.equal(seen.scope, 'api:write');
  assert.equal(lastOrigin.headers.get('x-turingate-agent'), 'claude-code'); assert.equal(lastOrigin.headers.get('x-turingate-owner'), 'Ada'); assert.equal(lastOrigin.headers.get('x-turingate-tier'), '2');
});

test('invalid pass or another site → 403; Turingate down → 503 unless FAIL_OPEN', async () => {
  verifyReply = { valid: false, reasons: ['pass expired'] };
  assert.equal((await call('/api/x', { headers: { authorization: 'AgentPass a.b.c' } })).status, 403);
  verifyReply = { valid: true, reasons: [], claims: { aud: 's_ffffffffffffffff' } };
  assert.equal((await call('/api/x', { headers: { authorization: 'AgentPass a.b.c' } })).status, 403);
  verifyReply = () => { throw new Error('down'); };
  const real = globalThis.fetch; globalThis.fetch = async (i, n) => { const q = i instanceof Request ? i : new Request(i, n); if (q.url.startsWith('https://tg.test/')) throw new Error('network'); return real(i, n); };
  assert.equal((await call('/api/x', { headers: { authorization: 'AgentPass a.b.c' } })).status, 503);
  assert.equal(await (await gate.fetch(new Request('https://shop.example/api/x', { headers: { authorization: 'AgentPass a.b.c' } }), { ...env, FAIL_OPEN: 'true' })).text(), 'origin ok');
  globalThis.fetch = real;
});
