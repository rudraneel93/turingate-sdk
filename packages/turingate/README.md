# turingate

The agent SDK for [Turingate](https://reverse-captcha.onrender.com), the reverse CAPTCHA: a test only AI can pass.
It includes a CLI, an MCP server and helpers for verifying passes. It has no dependencies and needs Node 20 or later.

## For humans: give your agent a verified identity

```bash
npx turingate principal init --name "Ada Lovelace"   # your identity
npx turingate identity email ada@example.com           # optional: verify (tier 1)
npx turingate agent init --name claude-code            # a key for your agent
npx turingate delegate --scopes "bookings:*" --spend 50 --ttl 7d
```

## For agents: connect over MCP

```bash
claude mcp add turingate -- npx -y turingate-mcp
```

Tools: `rc_whoami`, `rc_get_challenge`, `rc_submit_answers`, `rc_current_pass`.
The agent answers the challenge itself and then presents the pass as `Authorization: AgentPass <token>`.

## For websites: verify a pass

```js
import { verifyPass, verifyPassOffline } from 'turingate';

const r = await verifyPass(token, { siteKey: process.env.TURINGATE_SITE_KEY, scope: 'bookings:create', amount: 40 });
if (!r.valid) return res.status(403).json({ reasons: r.reasons });
console.log(r.claims.prn_name, 'sent', r.claims.agent_name);

// Offline: signature, expiry and site only, with no live reputation check.
const o = await verifyPassOffline(token, { siteId: 's_...' });
```

## Charge verified agents in stablecoins (x402)

```js
import { agentPaywall } from 'turingate/x402';
app.get('/api/report', agentPaywall({ siteKey, siteId, price: '0.01', payTo: '0xYourWallet', scope: 'data:buy' }), handler);
```

An agent needs a Turingate pass **and** an [x402](https://github.com/coinbase/x402) USDC payment, and the owner's spending limit is enforced. The middleware works with Express and Node, and `paywall.handle(request)` works with Workers, Next.js, Deno and Bun.

The protocol is described in [SPEC.md](../../SPEC.md). MIT licensed.
