// Turingate Gate: a Cloudflare Worker that puts the reverse CAPTCHA in front of chosen paths.
// Humans and normal traffic pass straight through. Requests carrying an agent pass are verified, and your origin
// receives who sent the agent in X-Turingate-* headers. Optionally, some paths can be made agents-only.
//
// Settings (Workers → turingate-gate → Settings → Variables and secrets):
//   TURINGATE_SITE_ID   s_… from the Turingate Console
//   TURINGATE_SITE_KEY  your API key (add it as a *secret*)
//   PROTECT_PATHS       comma-separated paths to check, e.g. "/api/*,/checkout"
//   AGENTS_ONLY_PATHS   optional: paths where a pass is required (401 without one), e.g. "/agent-api/*"
//   READ_SCOPE / WRITE_SCOPE   scopes required for GET / other methods (default: none / none)
//   FAIL_OPEN           "true" to let agent requests through if Turingate can't be reached (default: false)
//
// Optional stablecoin payments (x402): agents must hold a pass AND pay per request on these paths.
//   PAID_PATHS          e.g. "/api/premium/*"
//   PRICE               price per request in USDC, e.g. "0.01"
//   PAY_TO              your 0x… wallet address (payments go straight to you)
//   NETWORK             "base" (default) or "base-sepolia" for testing
//   FACILITATOR_URL     x402 facilitator (default https://x402.org/facilitator, testnet only; use a production facilitator for mainnet)
//   REQUIRE_OWNER_WALLET "true" to only accept payments from the wallet the agent's owner linked to Turingate

import { agentPaywall } from './x402.js';

const DEFAULT_SERVER = 'https://reverse-captcha.onrender.com';
const SPOOFABLE = ['x-turingate-verified', 'x-turingate-agent', 'x-turingate-owner', 'x-turingate-tier', 'x-turingate-scopes', 'x-turingate-agent-id', 'x-turingate-paid'];

export function matchPath(pathname, list) {
  return String(list || '').split(',').map((s) => s.trim()).filter(Boolean).some((p) => (
    p.endsWith('*') ? pathname.startsWith(p.slice(0, -1)) : pathname === p || pathname === `${p}/`
  ));
}

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

export async function verifyPass(env, token, scope) {
  const server = (env.TURINGATE_SERVER || DEFAULT_SERVER).replace(/\/$/, '');
  const body = { token };
  if (scope) body.scope = scope;
  const res = await fetch(`${server}/v1/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-site-key': env.TURINGATE_SITE_KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Turingate returned HTTP ${res.status}`);
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    for (const h of SPOOFABLE) headers.delete(h); // only the gate may set these
    const forward = () => fetch(new Request(request, { headers }));

    if (matchPath(url.pathname, env.PAID_PATHS)) {
      if (!env.TURINGATE_SITE_ID || !env.TURINGATE_SITE_KEY || !env.PRICE || !env.PAY_TO) return json(500, { error: 'Paid paths need TURINGATE_SITE_ID, TURINGATE_SITE_KEY, PRICE and PAY_TO' });
      const gate = agentPaywall({
        siteKey: env.TURINGATE_SITE_KEY, siteId: env.TURINGATE_SITE_ID, server: env.TURINGATE_SERVER || DEFAULT_SERVER,
        scope: env.PAID_SCOPE || undefined, price: env.PRICE, payTo: env.PAY_TO, network: env.NETWORK || 'base',
        facilitator: env.FACILITATOR_URL || undefined, requireOwnerWallet: env.REQUIRE_OWNER_WALLET === 'true',
      });
      const r = await gate.handle(request);
      if (r.response) return r.response;
      headers.set('x-turingate-verified', '1');
      headers.set('x-turingate-agent', String(r.agent.name || 'agent'));
      if (r.agent.owner) headers.set('x-turingate-owner', String(r.agent.owner));
      if (r.agent.tier != null) headers.set('x-turingate-tier', String(r.agent.tier));
      headers.set('x-turingate-paid', `${r.payment.amount} ${r.payment.asset} ${r.payment.transaction || ''}`.trim());
      const res = await forward();
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(r.headers)) out.headers.set(k, v);
      return out;
    }

    const agentsOnly = matchPath(url.pathname, env.AGENTS_ONLY_PATHS);
    if (!agentsOnly && !matchPath(url.pathname, env.PROTECT_PATHS)) return forward();
    if (!env.TURINGATE_SITE_ID || !env.TURINGATE_SITE_KEY) return json(500, { error: 'Turingate Gate is not configured: set TURINGATE_SITE_ID and the TURINGATE_SITE_KEY secret' });

    const token = /^AgentPass\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!token) {
      if (!agentsOnly) return forward(); // humans and normal clients are untouched
      return json(401, { error: 'This endpoint is for AI agents with a Turingate pass.', how: `Get a pass for site ${env.TURINGATE_SITE_ID} and send Authorization: AgentPass <pass>` },
        { 'www-authenticate': `AgentPass site="${env.TURINGATE_SITE_ID}"` });
    }
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    let r;
    try { r = await verifyPass(env, token, write ? env.WRITE_SCOPE : env.READ_SCOPE); } catch (e) {
      if (env.FAIL_OPEN === 'true') return forward();
      return json(503, { error: 'Could not verify the agent pass right now. Try again shortly.' });
    }
    if (!r.valid) return json(403, { error: 'Agent pass rejected', reasons: r.reasons });
    const c = r.claims || {};
    if (c.aud && c.aud !== env.TURINGATE_SITE_ID) return json(403, { error: 'Agent pass was issued for a different site' });
    headers.set('x-turingate-verified', '1');
    headers.set('x-turingate-agent', String(c.agent_name || 'agent'));
    if (c.sub) headers.set('x-turingate-agent-id', c.sub);
    if (c.prn_name) headers.set('x-turingate-owner', String(c.prn_name));
    if (c.tier != null) headers.set('x-turingate-tier', String(c.tier));
    if (Array.isArray(c.scopes)) headers.set('x-turingate-scopes', c.scopes.join(' '));
    return forward();
  },
};
