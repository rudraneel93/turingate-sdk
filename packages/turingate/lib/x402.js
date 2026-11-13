// Turingate + x402: charge AI agents in stablecoins, but only verified ones.
//
//   1. Who is this agent? A Turingate pass names the verified owner and their spending limit.
//   2. Can it pay? An x402 payment (USDC on Base by default), checked and settled by any x402 facilitator.
//   3. Optional: the payment must come from the wallet the owner linked to their Turingate identity.
//
// Turingate never touches the money: payments go straight from the agent's wallet to `payTo`.
// Runtime-agnostic (Node 18+, Express, Next.js, Cloudflare Workers, Deno, Bun): only fetch + web APIs.

const DEFAULT_SERVER = 'https://reverse-captcha.onrender.com';

export const NETWORKS = { base: 'eip155:8453', 'base-sepolia': 'eip155:84532' };
const V1_NAMES = Object.fromEntries(Object.entries(NETWORKS).map(([k, v]) => [v, k]));

// USDC (EIP-3009) per network. EIP-712 domain name/version are needed by x402 "exact" EVM payments.
export const ASSETS = {
  USDC: {
    'eip155:8453': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, name: 'USD Coin', version: '2' },
    'eip155:84532': { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, name: 'USDC', version: '2' },
  },
};

const enc = new TextEncoder(); const dec = new TextDecoder();
export const b64json = (o) => { let s = ''; for (const b of enc.encode(JSON.stringify(o))) s += String.fromCharCode(b); return btoa(s); };
export const unb64json = (s) => JSON.parse(dec.decode(Uint8Array.from(atob(String(s).trim()), (c) => c.charCodeAt(0))));

// "0.01" USDC → "10000" (atomic units), exact decimal string math.
export function toAtomic(amount, decimals) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(amount).trim());
  if (!m) throw new Error(`invalid amount "${amount}"`);
  const frac = (m[2] || '');
  if (frac.length > decimals) throw new Error(`amount "${amount}" has more than ${decimals} decimals`);
  return (BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

function resolveAsset(asset, network) {
  if (asset && typeof asset === 'object') return { symbol: asset.symbol || 'TOKEN', ...asset };
  const sym = String(asset || 'USDC').toUpperCase();
  const a = ASSETS[sym]?.[network];
  if (!a) throw new Error(`no built-in ${sym} contract for ${network}; pass asset: { address, decimals, name, version, symbol }`);
  return { symbol: sym, ...a };
}

function headerGetter(headers) {
  if (!headers) return () => null;
  if (typeof headers.get === 'function') return (k) => headers.get(k);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
  return (k) => lower[k.toLowerCase()] ?? null;
}

/**
 * Creates a gate. Options:
 *   siteKey (required), siteId (required)        your Turingate keys
 *   scope                                         permission the agent's owner must have granted, e.g. 'api:read'
 *   price, payTo, network = 'base', asset = 'USDC' charge per request (omit price for identity only)
 *   facilitator = 'https://x402.org/facilitator'  or { url, headers: async () => ({ Authorization: … }) }
 *   requireOwnerWallet = false                    payment must come from the owner's linked wallet
 *   x402Version = 2, description, mimeType, maxTimeoutSeconds = 60, server, fetch
 */
export function agentPaywall(opts) {
  if (!opts?.siteKey || !opts?.siteId) throw new Error('agentPaywall needs siteKey and siteId');
  const f = opts.fetch || ((...a) => fetch(...a));
  const server = (opts.server || DEFAULT_SERVER).replace(/\/$/, '');
  const version = opts.x402Version === 1 ? 1 : 2;
  const fac = typeof opts.facilitator === 'object' && opts.facilitator ? opts.facilitator : { url: opts.facilitator || 'https://x402.org/facilitator' };
  const network = NETWORKS[opts.network] || opts.network || NETWORKS.base;
  const priced = opts.price != null && opts.price !== '';
  let asset = null, atomic = null;
  if (priced) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(opts.payTo || ''))) throw new Error('payTo must be your 0x… wallet address');
    asset = resolveAsset(opts.asset, network);
    atomic = toAtomic(opts.price, asset.decimals);
  }

  function requirements(url) {
    const extra = asset.name ? { name: asset.name, version: asset.version } : undefined;
    if (version === 1) {
      return [{ scheme: 'exact', network: V1_NAMES[network] || network, maxAmountRequired: atomic, resource: url, description: opts.description || '', mimeType: opts.mimeType || 'application/json',
        payTo: opts.payTo, maxTimeoutSeconds: opts.maxTimeoutSeconds || 60, asset: asset.address, ...(extra ? { extra } : {}) }];
    }
    return [{ scheme: 'exact', network, amount: atomic, asset: asset.address, payTo: opts.payTo, maxTimeoutSeconds: opts.maxTimeoutSeconds || 60, ...(extra ? { extra } : {}) }];
  }
  function paymentRequired(url, error) {
    const turingate = { site: opts.siteId, auth: 'Authorization: AgentPass <Turingate pass for this site>', docs: `${server}/docs#payments` };
    if (version === 1) return { x402Version: 1, error, accepts: requirements(url) };
    return { x402Version: 2, error, resource: { url, description: opts.description || '', mimeType: opts.mimeType || 'application/json' }, accepts: requirements(url), extensions: { turingate } };
  }
  const deny = (status, body, headers = {}) => ({ ok: false, status, headers: { 'content-type': 'application/json', ...headers }, body });
  const need402 = (url, error) => {
    const pr = paymentRequired(url, error);
    return deny(402, version === 1 ? pr : { error, x402Version: 2, price: `${opts.price} ${asset.symbol}`, network, payTo: opts.payTo },
      version === 1 ? {} : { 'payment-required': b64json(pr) });
  };
  async function facilitator(path, payload, reqs) {
    const headers = { 'content-type': 'application/json', ...(fac.headers ? await fac.headers(path) : {}) };
    const res = await f(`${fac.url.replace(/\/$/, '')}/${path}`, { method: 'POST', headers, body: JSON.stringify({ x402Version: version, paymentPayload: payload, paymentRequirements: reqs }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok && j.isValid === undefined && j.success === undefined) throw new Error(`facilitator ${path} HTTP ${res.status}`);
    return j;
  }

  /** Core check. Returns { ok: true, agent, payment, headers } or { ok: false, status, headers, body }. */
  async function check({ method = 'GET', url, headers }) {
    const h = headerGetter(headers);
    const token = /^AgentPass\s+(\S+)$/i.exec(h('authorization') || '')?.[1] || h('x-agent-pass');
    if (!token) {
      const extra = priced && version === 2 ? { 'payment-required': b64json(paymentRequired(url, 'Turingate pass required')) } : {};
      return deny(401, { error: 'This endpoint is for verified AI agents. Get a Turingate pass for this site, then retry with Authorization: AgentPass <pass>.', site: opts.siteId },
        { 'www-authenticate': `AgentPass site="${opts.siteId}"`, ...extra });
    }
    const body = { token };
    if (opts.scope) body.scope = opts.scope;
    if (priced) { body.amount = Number(opts.price); body.currency = asset.symbol; }
    let v;
    try {
      const r = await f(`${server}/v1/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-site-key': opts.siteKey }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      v = await r.json();
    } catch (e) { return deny(503, { error: `could not verify the agent pass: ${e.message}` }); }
    if (!v.valid) return deny(403, { error: 'Agent pass rejected', reasons: v.reasons });
    const c = v.claims || {};
    if (c.aud && c.aud !== opts.siteId) return deny(403, { error: 'Agent pass was issued for a different site' });
    const agent = { name: c.agent_name, id: c.sub, owner: c.prn_name, ownerId: c.prn, tier: c.tier, scopes: c.scopes, wallet: c.wal || null, reputation: c.rep_now ?? c.rep };
    if (!priced) return { ok: true, agent, payment: null, headers: {} };

    const raw = h('payment-signature') || h('x-payment');
    if (!raw) return need402(url, 'Payment required');
    let payload;
    try { payload = unb64json(raw); } catch { return deny(400, { error: 'payment header is not valid base64 JSON' }); }
    const [reqs] = requirements(url);
    if (version === 2) {
      const a = payload?.accepted || {};
      const same = a.scheme === reqs.scheme && a.network === reqs.network && String(a.asset).toLowerCase() === reqs.asset.toLowerCase()
        && String(a.payTo).toLowerCase() === reqs.payTo.toLowerCase() && String(a.amount) === reqs.amount;
      if (!same) return need402(url, 'payment does not match this resource\'s price or terms');
    } else if (payload?.scheme !== reqs.scheme || payload?.network !== reqs.network) {
      return need402(url, 'payment does not match this resource\'s network or scheme');
    }
    let ver, set;
    try { ver = await facilitator('verify', payload, reqs); } catch (e) { return deny(502, { error: `payment could not be verified: ${e.message}` }); }
    if (!ver.isValid) return need402(url, `payment invalid: ${ver.invalidReason || 'unknown reason'}`);
    if (opts.requireOwnerWallet) {
      if (!agent.wallet) return deny(403, { error: 'this site requires the agent\'s owner to link a wallet to their Turingate identity' });
      if (String(ver.payer || '').toLowerCase() !== agent.wallet.toLowerCase()) return deny(403, { error: 'payment must come from the wallet linked to the agent\'s owner' });
    }
    try { set = await facilitator('settle', payload, reqs); } catch (e) { return deny(502, { error: `payment settlement failed: ${e.message}` }); }
    if (!set.success) return need402(url, `payment failed: ${set.errorReason || 'settlement error'}`);
    const payment = { amount: opts.price, asset: asset.symbol, network, payer: set.payer || ver.payer, transaction: set.transaction };
    return { ok: true, agent, payment, headers: { [version === 1 ? 'x-payment-response' : 'payment-response']: b64json(set) } };
  }

  // Express / Node http middleware: (req, res, next). Sets req.turingate = { agent, payment }.
  async function middleware(req, res, next) {
    const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
    const url = `${proto}://${req.headers.host}${req.originalUrl || req.url}`;
    const r = await check({ method: req.method, url, headers: req.headers });
    for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
    if (!r.ok) { res.statusCode = r.status; res.end(JSON.stringify(r.body)); return; }
    req.turingate = { agent: r.agent, payment: r.payment };
    if (next) next();
  }
  // Fetch-style (Workers, Next.js route handlers, Deno, Bun): returns a Response to send, or null to continue.
  async function handle(request) {
    const r = await check({ method: request.method, url: request.url, headers: request.headers });
    if (r.ok) return { response: null, agent: r.agent, payment: r.payment, headers: r.headers };
    return { response: new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers }), agent: null, payment: null, headers: r.headers };
  }
  middleware.check = check; middleware.handle = handle; middleware.paymentRequired = paymentRequired;
  return middleware;
}
