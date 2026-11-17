#!/usr/bin/env node
// turingate: human-side CLI. Set up your principal identity, mint an agent key,
// delegate scoped authority to it, and (for sites) verify/report passes.
import {
  serverUrl, homeFile, readJsonFile, writeSecret, newIdentity, loadIdentity, registerPrincipal,
  createDelegation, requestChallenge, submitAnswers, api, parseTtl, identity, downloadImages,
} from './lib/client.js';
import { decodeJws } from './lib/crypto.js';
import { readFileSync, existsSync } from 'node:fs';

const readText = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim() : null);

const [cmd, sub, ...rest] = process.argv.slice(2);
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));

const HELP = `turingate: the reverse CAPTCHA / Know-Your-Agent CLI

  turingate mcp                                       run the MCP server (stdio) for Claude Code, Codex, Cursor…

  turingate config --server URL                       set the server (default https://reverse-captcha.onrender.com)
  turingate principal init --name NAME                create + register your human identity
  turingate identity email ADDRESS                    verify your email (tier 1); a code is sent
  turingate identity confirm CODE                     confirm the emailed code
  turingate identity card                             verify a card (tier 2); prints a checkout link
  turingate identity status                           show your verification tier
  turingate identity wallet 0xADDRESS                 link a crypto wallet (prints a message to sign)
  turingate identity wallet-confirm 0xSIGNATURE       finish linking the wallet
  turingate identity recover ADDRESS                  lost your key? run 'turingate principal init' for a new one, then this
  turingate identity recover-confirm CODE             move your verified identity + reputation to the new key
  turingate agent init --name NAME                    create a key for your AI agent
  turingate delegate [--scopes a,b:*] [--spend 50] [--currency USD|USDC|EUR…] [--ttl 24h]
                                               authorize the agent to act for you
  turingate whoami                                    show identities and current delegation
  turingate challenge [--site s_...] [--images 0-3]   fetch a bound challenge for a site (saved for 'turingate solve')
  turingate solve --answers FILE.json                 submit {"t1": "...", ...} for the saved challenge
  turingate site register --name NAME                 get a site API key (for reporting)
  turingate verify TOKEN --site-key KEY [--scope S] [--amount N]
                                               check a pass token
  turingate report TOKEN --outcome good|abuse|fraud|spam --site-key KEY
`;

async function main() {
  const server = serverUrl();
  switch (cmd) {
    case 'config': {
      const s = flag('server');
      if (!s) throw new Error('usage: turingate config --server URL');
      writeSecret(homeFile('config.json'), { server: s });
      return out(`server = ${s}`);
    }
    case 'principal': {
      if (sub !== 'init') break;
      let p = loadIdentity('principal');
      if (!p) { p = newIdentity('principal', flag('name', 'me')); writeSecret(homeFile('principal.json'), p); }
      const r = await registerPrincipal(server, p);
      return out({ ...r, keyFile: homeFile('principal.json') });
    }
    case 'identity': {
      const p = loadIdentity('principal');
      if (!p) throw new Error('run `turingate principal init` first');
      if (sub === 'email') return out(await identity.startEmail(server, p, rest[0]));
      if (sub === 'confirm') return out(await identity.confirmEmail(server, p, rest[0]));
      if (sub === 'card') return out(await identity.startCard(server, p));
      if (sub === 'status') return out(await identity.status(server, p));
      if (sub === 'wallet') {
        const r = await identity.startWallet(server, p, rest[0]);
        return out(`Sign this exact message with the wallet ${r.address} (personal_sign: MetaMask, Coinbase Wallet, Rabby,\nor: cast wallet sign --interactive "<message>"), then run:\n  turingate identity wallet-confirm 0x<signature>\n\n----- message -----\n${r.message}\n-------------------`);
      }
      if (sub === 'wallet-confirm') return out(await identity.confirmWallet(server, p, rest[0]));
      if (sub === 'recover') return out(await identity.recoverStart(server, p, rest[0]));
      if (sub === 'recover-confirm') return out(await identity.recoverConfirm(server, p, rest[0]));
      break;
    }
    case 'agent': {
      if (sub !== 'init') break;
      let a = loadIdentity('agent');
      if (!a) { a = newIdentity('agent', flag('name', 'agent')); writeSecret(homeFile('agent.json'), a); }
      return out({ agentId: a.id, name: a.name, keyFile: homeFile('agent.json') });
    }
    case 'delegate': {
      const p = loadIdentity('principal'); const a = loadIdentity('agent');
      if (!p || !a) throw new Error('run `turingate principal init` and `turingate agent init` first');
      const scopes = flag('scopes', '').split(',').map((s) => s.trim()).filter(Boolean);
      const spend = flag('spend') != null ? Number(flag('spend')) : null;
      const token = createDelegation(p, a, { scopes, spend, currency: flag('currency', 'USD').toUpperCase(), ttlSec: parseTtl(flag('ttl', '24h')) });
      writeSecret(homeFile('delegation.jwt'), token);
      const c = decodeJws(token).payload;
      return out({ agent: c.sub, scopes: c.scopes, spend_limit: c.spend_limit, expires: new Date(c.exp * 1000).toISOString() });
    }
    case 'whoami': {
      const p = loadIdentity('principal'); const a = loadIdentity('agent');
      const dTok = readText(homeFile('delegation.jwt'));
      const d = dTok ? decodeJws(dTok).payload : null;
      return out({
        server, principal: p && { id: p.id, name: p.name }, agent: a && { id: a.id, name: a.name },
        delegation: d && { scopes: d.scopes, spend_limit: d.spend_limit, expires: new Date(d.exp * 1000).toISOString() },
      });
    }
    case 'challenge': {
      const ch = await requestChallenge(server, readText(homeFile('delegation.jwt')), { images: Number(flag('images', 0)), site: flag('site') });
      writeSecret(homeFile('challenge.json'), ch);
      const files = await downloadImages(server, ch, homeFile('images'));
      for (const t of ch.tasks) if (files[t.id]) t.imageFile = files[t.id];
      return out(ch);
    }
    case 'solve': {
      const ch = readJsonFile(homeFile('challenge.json'));
      if (!ch) throw new Error('run `turingate challenge` first');
      const answers = readJsonFile(flag('answers'));
      const r = await submitAnswers(server, ch, answers, ch.mode === 'bound' ? loadIdentity('agent') : null);
      if (r.passToken) writeSecret(homeFile('pass.jwt'), r.passToken);
      return out(r);
    }
    case 'site': {
      if (sub !== 'register') break;
      return out(await api(server, '/v1/sites', { name: flag('name', 'site') }));
    }
    case 'verify': {
      const body = { token: sub };
      if (flag('scope')) body.scope = flag('scope');
      if (flag('amount')) body.amount = Number(flag('amount'));
      return out(await api(server, '/v1/verify', body, flag('site-key') ? { 'x-site-key': flag('site-key') } : {}));
    }
    case 'report': {
      return out(await api(server, '/v1/reports', { token: sub, outcome: flag('outcome') }, { 'x-site-key': flag('site-key') }));
    }
    default:
  }
  process.stdout.write(HELP);
  process.exitCode = cmd ? 1 : 0;
}

// `turingate mcp` starts the MCP server (stdio), so `npx -y turingate mcp` works with no extra package.
if (cmd === 'mcp') await import('./mcp.js');
else main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
