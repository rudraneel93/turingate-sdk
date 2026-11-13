// Site-side helpers: verify an agent pass online (recommended) or offline against the public JWKS.
import { decodeJws, verifyBytes } from './crypto.js';
import { DEFAULT_SERVER } from './client.js';

/**
 * Online verification: checks signature, expiry, site, scope, amount, tier and live reputation.
 * @returns {Promise<{valid: boolean, reasons: string[], claims?: object}>}
 */
export async function verifyPass(token, { siteKey, scope, amount, currency, minTier, requireBound, server = DEFAULT_SERVER } = {}) {
  if (!siteKey) throw new Error('siteKey is required (from the Turingate Console)');
  const body = { token };
  if (scope) body.scope = scope;
  if (amount != null) body.amount = amount;
  if (currency) body.currency = currency;
  if (minTier != null) body.minTier = minTier;
  if (requireBound) body.requireBound = true;
  const res = await fetch(new URL('/v1/verify', server), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-site-key': siteKey }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`verify failed: HTTP ${res.status}`);
  return res.json();
}

const jwksCache = new Map(); // server -> { at, keys }

async function keysFor(server) {
  const c = jwksCache.get(server);
  if (c && Date.now() - c.at < 3_600_000) return c.keys;
  const res = await fetch(new URL('/.well-known/jwks.json', server));
  if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
  const { keys } = await res.json();
  jwksCache.set(server, { at: Date.now(), keys });
  return keys;
}

/**
 * Offline verification: signature, issuer, expiry and audience only (no live reputation or bans).
 * Use for latency-sensitive paths; use verifyPass for anything involving money.
 */
export async function verifyPassOffline(token, { siteId, server = DEFAULT_SERVER, now = Date.now() } = {}) {
  const reasons = [];
  let d;
  try { d = decodeJws(token); } catch { return { valid: false, reasons: ['malformed token'] }; }
  if (d.header.alg !== 'EdDSA' || d.header.typ !== 'rc-pass+jwt') return { valid: false, reasons: ['not a Turingate pass'] };
  let keys = await keysFor(server);
  let key = keys.find((k) => k.kid === d.header.kid);
  if (!key) { jwksCache.delete(server); keys = await keysFor(server); key = keys.find((k) => k.kid === d.header.kid); }
  if (!key || !verifyBytes(d.signingInput, d.sig, key)) return { valid: false, reasons: ['bad signature'] };
  const c = d.payload;
  if (typeof c.exp !== 'number' || now / 1000 >= c.exp) reasons.push('pass expired');
  if (c.iss && new URL(c.iss).origin !== new URL(server).origin) reasons.push('wrong issuer');
  if (siteId && c.aud && c.aud !== siteId) reasons.push('pass was issued for a different site');
  return { valid: reasons.length === 0, reasons, claims: c };
}
