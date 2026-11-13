# Turingate Gate for Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rudraneel93/turingate-sdk/tree/main/integrations/cloudflare-gate)

This puts the reverse CAPTCHA in front of any site on Cloudflare **without changing your code**.

- **Humans and normal traffic** pass straight through, untouched.
- **Requests with an agent pass** (`Authorization: AgentPass …`) on the paths you choose are verified. Invalid or over-scope passes get a `403`.
- **Your origin learns who sent the agent** through the `X-Turingate-Agent`, `X-Turingate-Owner`, `X-Turingate-Tier` and `X-Turingate-Scopes` headers. Incoming copies of these headers are always stripped, so they can't be spoofed.
- **Agents-only paths** (optional) answer `401` with `WWW-Authenticate: AgentPass site="…"`, telling agents how to get a pass.

## Set up in 3 steps

1. Click **Deploy to Cloudflare** above.
2. In **Workers → turingate-gate → Settings → Variables and secrets**, set:
   | Name | Value |
   |---|---|
   | `TURINGATE_SITE_ID` | your `s_…` site ID from the [Console](https://reverse-captcha.onrender.com/console) |
   | `TURINGATE_SITE_KEY` | your API key (**type: Secret**) |
   | `PROTECT_PATHS` | e.g. `/api/*,/checkout` |
   | `AGENTS_ONLY_PATHS` | optional, e.g. `/agent-api/*` |
   | `WRITE_SCOPE` / `READ_SCOPE` | optional, e.g. `api:write` / `api:read` |
3. **Settings → Domains & Routes → Add route**, e.g. `yourdomain.com/api/*`.

## Charge agents in USDC (optional, x402)

Set `PAID_PATHS` (e.g. `/api/premium/*`), `PRICE` (e.g. `0.01`), `PAY_TO` (your wallet) and optionally `NETWORK` (`base` or `base-sepolia`), `FACILITATOR_URL` and `REQUIRE_OWNER_WALLET`.
On paid paths, agents need a Turingate pass **and** an x402 payment. Payments go straight to your wallet, and your origin receives `X-Turingate-Paid: 0.01 USDC 0x<tx>`.

Test it with `npm test`, which runs the gate against a stubbed origin and a stubbed Turingate API.
