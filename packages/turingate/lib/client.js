// Agent-side protocol: identities, delegations, challenges and answers.
// Everything here talks to the public Turingate API; nothing runs server-side logic.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { genKeys, signJws, signBytes, thumbprint, publicOnly } from './crypto.js';

export const DEFAULT_SERVER = 'https://reverse-captcha.onrender.com';
export const home = () => process.env.TURINGATE_HOME || process.env.RC_HOME || join(homedir(), '.turingate');
export const homeFile = (name) => join(home(), name);

export function readJsonFile(file, fallback = null) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}
export function writeSecret(file, content) {
  mkdirSync(home(), { recursive: true, mode: 0o700 });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), { mode: 0o600 });
}
export function serverUrl() {
  return process.env.TURINGATE_SERVER || process.env.RC_SERVER || readJsonFile(homeFile('config.json'), {}).server || DEFAULT_SERVER;
}

export function newIdentity(kind, name) {
  const keys = genKeys();
  return { id: `${kind === 'principal' ? 'p' : 'a'}_${thumbprint(keys.publicJwk)}`, name, ...keys };
}
export const loadIdentity = (kind) => readJsonFile(homeFile(`${kind}.json`));

export async function api(server, path, body, headers = {}) {
  const init = body === undefined ? { headers }
    : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) };
  const res = await fetch(new URL(path, server), init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json.error || res.statusText}`);
  return json;
}

export function registerPrincipal(server, p) {
  return api(server, '/v1/principals', {
    name: p.name, publicJwk: publicOnly(p.publicJwk), proof: signBytes(`rc-register:${p.id}`, p.privateJwk),
  });
}

// Body for principal-authenticated identity endpoints.
export function authBody(principal, action, extra = {}) {
  const ts = Math.floor(Date.now() / 1000);
  return { principalId: principal.id, ts, sig: signBytes(`rc-auth:${action}:${principal.id}:${ts}`, principal.privateJwk), ...extra };
}

export const identity = {
  status: (server, p) => api(server, '/v1/identity/status', authBody(p, 'status')),
  startEmail: (server, p, email) => api(server, '/v1/identity/email/start', authBody(p, 'email-start', { email })),
  confirmEmail: (server, p, code) => api(server, '/v1/identity/email/confirm', authBody(p, 'email-confirm', { code })),
  startCard: (server, p) => api(server, '/v1/identity/card/start', authBody(p, 'card-start')),
  startWallet: (server, p, address) => api(server, '/v1/identity/wallet/start', authBody(p, 'wallet-start', { address })),
  confirmWallet: (server, p, signature) => api(server, '/v1/identity/wallet/confirm', authBody(p, 'wallet-confirm', { signature })),
  recoverStart: (server, p, email) => api(server, '/v1/identity/recover/start', authBody(p, 'recover-start', { email })),
  recoverConfirm: (server, p, code) => api(server, '/v1/identity/recover/confirm', authBody(p, 'recover-confirm', { code })),
};

// A delegation is the human's signed permission slip for one agent key (see SPEC.md).
export function createDelegation(principal, agent, { scopes = [], spend = null, currency = 'USD', ttlSec = 86400 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signJws({
    iss: principal.id, sub: agent.id, agent_name: agent.name ?? null,
    cnf: { jwk: publicOnly(agent.publicJwk) },
    scopes, spend_limit: spend == null ? null : { amount: spend, currency },
    iat: now, exp: now + ttlSec, jti: randomUUID(),
  }, principal.privateJwk, principal.id, 'rc-delegation+jwt');
}

export function requestChallenge(server, delegation, { images = 0, site = null } = {}) {
  const body = delegation ? { delegation } : {};
  if (images) body.images = images;
  if (site) body.site = site;
  return api(server, '/v1/challenges', body);
}

// Download a challenge's image tasks; returns { taskId: localPath }.
export async function downloadImages(server, challenge, dir) {
  const out = {};
  const imgs = challenge.tasks.filter((t) => t.image);
  if (!imgs.length) return out;
  mkdirSync(dir, { recursive: true });
  await Promise.all(imgs.map(async (t) => {
    const res = await fetch(new URL(t.image, server));
    if (!res.ok) throw new Error(`image ${t.id}: HTTP ${res.status}`);
    const file = join(dir, `${challenge.challengeId}-${t.id}.png`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    out[t.id] = file;
  }));
  return out;
}

export function submitAnswers(server, challenge, answers, agent) {
  const body = { answers };
  if (agent) body.agentSig = signBytes(`rc-solve:${challenge.challengeId}:${challenge.nonce}`, agent.privateJwk);
  return api(server, `/v1/challenges/${challenge.challengeId}/solve`, body);
}

export function parseTtl(s) {
  const m = String(s).match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`bad ttl "${s}" (use e.g. 30m, 24h, 7d)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}
