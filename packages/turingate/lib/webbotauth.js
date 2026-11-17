// Web Bot Auth verifier (IETF webbotauth: HTTP Message Signatures for automated traffic, RFC 9421 + Ed25519).
// Accepts the current draft (Signature-Agent as a Dictionary, component "signature-agent";key="<label>") and the
// earlier Cloudflare form (Signature-Agent as a bare String). Zero dependencies.
import { createHash, createPublicKey, createPrivateKey, sign as cryptoSign, verify as edVerify } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

// RFC 8037 A.3 / RFC 7638: SHA-256 over the required members in lexicographic order, no whitespace.
export function jwkThumbprint(jwk) {
  let json;
  if (jwk.kty === 'OKP') json = JSON.stringify({ crv: jwk.crv, kty: 'OKP', x: jwk.x });
  else if (jwk.kty === 'EC') json = JSON.stringify({ crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y });
  else if (jwk.kty === 'RSA') json = JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n });
  else throw new Error('unsupported key type');
  return b64u(createHash('sha256').update(json).digest());
}

// ---- minimal Structured Field parsing (RFC 8941) for the three headers ----
function splitTopLevel(s, sep) {
  const out = []; let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { cur += c; if (c === '\\') { cur += s[++i] ?? ''; } else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const unquote = (v) => (/^".*"$/.test(v) ? v.slice(1, -1).replace(/\\(["\\])/g, '$1') : v);

function parseParams(str) {
  const params = {};
  for (const p of splitTopLevel(str, ';')) {
    const i = p.indexOf('=');
    const k = (i < 0 ? p : p.slice(0, i)).trim().toLowerCase();
    const v = i < 0 ? true : p.slice(i + 1).trim();
    params[k] = v === true ? true : /^-?\d+$/.test(v) ? Number(v) : unquote(v);
  }
  return params;
}

// Signature-Input: label=("c1" "c2";key="x");created=..;keyid=".."  → { label: { raw, components:[{name, params, raw}], params } }
export function parseSignatureInput(header) {
  const out = {};
  for (const member of splitTopLevel(String(header ?? ''), ',')) {
    const eq = member.indexOf('=');
    if (eq < 0) continue;
    const label = member.slice(0, eq).trim();
    const raw = member.slice(eq + 1).trim();
    const m = raw.match(/^\(([^)]*)\)(.*)$/);
    if (!m) continue;
    const components = splitTopLevel(m[1], ' ').map((c) => {
      const [name, ...ps] = splitTopLevel(c, ';');
      return { name: unquote(name).toLowerCase(), params: ps.length ? parseParams(ps.join(';')) : {}, raw: c };
    });
    out[label] = { raw, components, params: parseParams(m[2].replace(/^;/, '')) };
  }
  return out;
}

export function parseSignature(header) {
  const out = {};
  for (const member of splitTopLevel(String(header ?? ''), ',')) {
    const m = member.match(/^([a-z*][a-z0-9_\-.*]*)=:([A-Za-z0-9+/=_-]*):/i);
    if (m) out[m[1]] = Buffer.from(m[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }
  return out;
}

// Signature-Agent: Dictionary (sig1="https://…";type=jwks_uri) or a bare String ("https://…").
export function parseSignatureAgent(header) {
  const h = String(header ?? '').trim();
  if (!h) return { form: null, members: {} };
  if (h.startsWith('"')) return { form: 'string', members: { '': { url: unquote(splitTopLevel(h, ';')[0]), params: {}, raw: h } } };
  const members = {};
  for (const member of splitTopLevel(h, ',')) {
    const eq = member.indexOf('=');
    if (eq < 0) continue;
    const [val, ...ps] = splitTopLevel(member.slice(eq + 1), ';');
    members[member.slice(0, eq).trim()] = { url: unquote(val.trim()), params: ps.length ? parseParams(ps.join(';')) : {}, raw: val.trim() };
  }
  return { form: 'dictionary', members };
}

// ---- RFC 9421 signature base ----
function componentValue(c, req, agent) {
  const u = new URL(req.url);
  switch (c.name) {
    case '@authority': return u.host.toLowerCase();
    case '@method': return String(req.method || 'GET').toUpperCase();
    case '@path': return u.pathname || '/';
    case '@query': return u.search || '?';
    case '@target-uri': return u.toString();
    case '@scheme': return u.protocol.replace(':', '');
    case '@request-target': return `${u.pathname}${u.search}`;
    default: {
      if (c.name.startsWith('@')) throw new Error(`unsupported derived component ${c.name}`);
      if (c.params.key != null) {
        if (c.name !== 'signature-agent') throw new Error(`unsupported keyed component ${c.name}`);
        const m = agent.members[c.params.key];
        if (!m) throw new Error(`Signature-Agent has no member "${c.params.key}"`);
        return m.raw; // the serialized String Item, e.g. "https://agent.example"
      }
      const v = req.headers[c.name];
      if (v == null) throw new Error(`covered header "${c.name}" is missing`);
      return String(Array.isArray(v) ? v.join(', ') : v).trim().replace(/\s*\r?\n\s*/g, ' ');
    }
  }
}

export function signatureBase(input, req, agent) {
  const lines = input.components.map((c) => `${c.raw}: ${componentValue(c, req, agent)}`);
  lines.push(`"@signature-params": ${input.raw}`);
  return lines.join('\n');
}

// ---- key resolution ----
async function defaultFetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/http-message-signatures-directory+json, application/jwk-set+json, application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`key directory HTTP ${r.status}`);
  return r.json();
}

export function directoryUrls(agentUrl, params = {}) {
  const u = new URL(agentUrl);
  if (u.protocol !== 'https:') throw new Error('Signature-Agent must be an https URL');
  const wellKnown = `${u.origin}/.well-known/http-message-signatures-directory`;
  if (params.type === 'jwks_uri') return [u.toString()];
  if (u.pathname && u.pathname !== '/' && !u.pathname.startsWith('/.well-known/http-message-signatures-directory')) return [u.toString(), wellKnown];
  return [wellKnown];
}

/**
 * Verify a Web Bot Auth signed request.
 * req: { method, url, headers } with lower-case header names.
 * opts.fetchJson(url) → JWKS (inject for caching / SSRF guards); opts.now (seconds); opts.skewSec.
 * Returns { present, verified, agent, keyid, label, created, expires, reasons[] }.
 */
export async function verifyWebBotAuth(req, { fetchJson = defaultFetchJson, now = Math.floor(Date.now() / 1000), skewSec = 60 } = {}) {
  const h = req.headers ?? {};
  const res = { present: false, verified: false, reasons: [] };
  if (!h.signature || !h['signature-input']) return res;
  res.present = true;
  try {
    const inputs = parseSignatureInput(h['signature-input']);
    const sigs = parseSignature(h.signature);
    const label = Object.keys(inputs).find((l) => inputs[l].params.tag === 'web-bot-auth' && sigs[l]);
    if (!label) throw new Error('no signature with tag="web-bot-auth"');
    const input = inputs[label]; const p = input.params;
    Object.assign(res, { label, keyid: p.keyid, created: p.created, expires: p.expires });
    if (p.alg && p.alg !== 'ed25519') throw new Error(`unsupported alg "${p.alg}" (ed25519 only)`);
    if (typeof p.created !== 'number' || typeof p.expires !== 'number' || !p.keyid) throw new Error('created, expires and keyid are required');
    if (p.created > now + skewSec) throw new Error('signature created in the future');
    if (p.expires < now - skewSec) throw new Error('signature expired');
    const names = input.components.map((c) => c.name);
    if (!names.includes('@authority') && !names.includes('@target-uri')) throw new Error('must cover @authority or @target-uri');
    const agent = parseSignatureAgent(h['signature-agent']);
    const sa = input.components.find((c) => c.name === 'signature-agent');
    if (!sa) throw new Error('signature-agent must be covered');
    const member = sa.params.key != null ? agent.members[sa.params.key] : agent.members[''] ?? Object.values(agent.members)[0];
    if (!member) throw new Error('Signature-Agent header missing or has no matching member');
    res.agent = new URL(member.url).host;
    res.agentUrl = member.url;
    let jwk = null, lastErr = null;
    for (const url of directoryUrls(member.url, member.params)) {
      try {
        const dir = await fetchJson(url);
        jwk = (dir?.keys ?? []).find((k) => k.kty === 'OKP' && k.crv === 'Ed25519' && jwkThumbprint(k) === p.keyid);
        if (jwk) { res.directory = url; break; }
      } catch (e) { lastErr = e; }
    }
    if (!jwk) throw new Error(lastErr && !res.directory ? `key directory unavailable (${lastErr.message})` : 'keyid not found in the agent\'s key directory');
    if (jwk.nbf && now < jwk.nbf - skewSec) throw new Error('key not yet valid');
    if (jwk.exp && now > jwk.exp + skewSec) throw new Error('key expired');
    const base = signatureBase(input, req, agent);
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    if (!edVerify(null, Buffer.from(base), key, sigs[label])) throw new Error('signature does not match');
    res.verified = true;
  } catch (e) { res.reasons.push(e.message); }
  return res;
}

// Sign a request the Web Bot Auth way (for agents, and for tests). privateJwk: Ed25519 JWK with d.
// form: 'dictionary' (current draft) or 'string' (earlier Cloudflare form).
export function signWebBotAuth({ method = 'GET', url, privateJwk, agentUrl, label = 'sig1', form = 'dictionary', created = Math.floor(Date.now() / 1000), ttl = 300, nonce } = {}) {
  const keyid = jwkThumbprint(privateJwk);
  const n = nonce ?? Buffer.from(createHash('sha256').update(`${created}:${Math.random()}`).digest()).subarray(0, 32).toString('base64');
  const saHeader = form === 'string' ? `"${agentUrl}"` : `${label}="${agentUrl}"`;
  const comp = form === 'string' ? '("@authority" "signature-agent")' : `("@authority" "signature-agent";key="${label}")`;
  const raw = `${comp};created=${created};keyid="${keyid}";alg="ed25519";expires=${created + ttl};nonce="${n}";tag="web-bot-auth"`;
  const headers = { 'signature-agent': saHeader, 'signature-input': `${label}=${raw}` };
  const input = parseSignatureInput(headers['signature-input'])[label];
  const base = signatureBase(input, { method, url, headers }, parseSignatureAgent(saHeader));
  const sig = cryptoSign(null, Buffer.from(base), createPrivateKey({ key: privateJwk, format: 'jwk' })).toString('base64');
  return { ...headers, signature: `${label}=:${sig}:` };
}
