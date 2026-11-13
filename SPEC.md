# Turingate agent-pass protocol, v0.1

This document describes the wire format that agents, websites and Turingate use to exchange **agent passes**.
How challenges are generated and how reputation is scored are server policy, not part of the protocol.

All signatures are **Ed25519**. Tokens are compact **JWS** with `alg: "EdDSA"`.
Key IDs are RFC 7638 JWK thumbprints. Identifiers are `p_<thumbprint>` for principals (humans or companies)
and `a_<thumbprint>` for agents.

## 1. Delegation (`typ: rc-delegation+jwt`), signed by the principal

The human's permission slip for one agent key.

| Claim | Meaning |
|---|---|
| `iss` | principal id |
| `sub` | agent id |
| `agent_name` | display name of the agent |
| `cnf.jwk` | the agent's public key (Ed25519 JWK) |
| `scopes` | allowed actions, e.g. `["bookings:*", "api:read"]`; `x:*` matches any `x:...` |
| `spend_limit` | `{ "amount": 50, "currency": "USD" }` or `null`. Currency is ISO 4217 or a stablecoin code (`USDC`, `USDT`, `PYUSD`, `EURC`…). A `USD` limit also covers dollar stablecoins, and `EUR` covers `EURC` |
| `iat`, `exp`, `jti` | issued-at, expiry (max 30 days), unique id |

## 2. Challenge

```
POST /v1/challenges         { "delegation"?: <jws>, "site"?: "s_...", "images"?: 0-3 }
→ { challengeId, nonce, tasks: [{ id, prompt, image? }], timeLimitMs, passThreshold, instructions }

POST /v1/challenges/{id}/solve
     { "answers": { "t1": "..." }, "agentSig"?: sign("rc-solve:{challengeId}:{nonce}", agentKey) }
→ { passed, correct, total, elapsedMs, passToken? }
```

`agentSig` proves that the agent named in the delegation is the one answering. Image tasks use the hidden-ink format:
the red-channel least-significant bits in raster order, MSB first, `"RC1" | uint16be length | UTF-8`.

## 3. Pass (`typ: rc-pass+jwt`), signed by Turingate

| Claim | Meaning |
|---|---|
| `iss` | Turingate origin |
| `jti`, `iat`, `exp` | unique id, issued-at, expiry (about 10 minutes, never later than the delegation) |
| `aud` | site id the pass is valid for (if the challenge named one) |
| `lvl` | `bound` (carries a principal) or `unbound` (anonymous widget pass) |
| `solve_ms` | how long the agent took |
| `sub`, `agent_name` | agent id and name (bound passes only) |
| `prn`, `prn_name`, `tier` | principal id, display name and verification tier: 0 key, 1 email, 2 card |
| `scopes`, `spend_limit` | copied from the delegation |
| `cnf.jkt` | thumbprint of the agent key the pass is bound to |
| `rep` | reputation score when the pass was issued |
| `wal` | the owner's linked wallet address, if they linked one (see 7) |

Public keys: `GET /.well-known/jwks.json`.

## 4. Presenting a pass to a site

```
Authorization: AgentPass <pass>
```

A site that wants a pass answers requests without one with:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: AgentPass site="s_..."
```

## 5. Verifying (site side)

```
POST /v1/verify   X-Site-Key: <secret>
{ "token", "scope"?, "amount"?, "currency"?, "minTier"?, "requireBound"?, "wallet"? }
→ { "valid": bool, "reasons": [...], "claims": {...} }
```

`wallet` makes verification fail unless the pass's owner linked that wallet. Use it to check that a payment came from the owner. Online verification also checks live reputation and bans. Offline verification against the JWKS checks the signature,
issuer, expiry and `aud` only.

## 6. Reporting outcomes

```
POST /v1/reports   X-Site-Key: <secret>   { "token", "outcome": "good" | "abuse" | "fraud" | "spam" }
```

Each site can report a given pass once. Repeated abuse blocks the agent and its principal network-wide.

## 7. Wallet linking (optional)

An owner can prove control of an Ethereum-style wallet. This is a signature only, with no transaction and no cost:

```
POST /v1/identity/wallet/start    { principalId, ts, sig, address }  → { message }
POST /v1/identity/wallet/confirm  { principalId, ts, sig, signature }  → { wallet }
```

`signature` is an EIP-191 `personal_sign` of `message`. The wallet then appears in passes as `wal`. A wallet can be linked to one identity only, and when an identity is banned, its wallet is banned with it.

## 8. Payments with x402

Turingate tells a site **who** an agent is. [x402](https://github.com/coinbase/x402) lets the agent **pay**. Used together:

1. The agent calls a paid resource without a pass. The site answers `401` with `WWW-Authenticate: AgentPass site="s_…"`, plus a v2 `PAYMENT-REQUIRED` header so the agent sees the price up front.
2. With a pass but no payment, the site verifies the pass, including the owner's spending limit for the price in USDC, and answers `402` with `PAYMENT-REQUIRED`.
3. The agent retries with `Authorization: AgentPass …` and `PAYMENT-SIGNATURE: …`. The site checks the payment matches its terms, then calls the facilitator's `/verify` and `/settle`. Optionally it requires the payer to be the owner's `wal`. It then serves the resource with a `PAYMENT-RESPONSE` header.

x402 v1 (`X-PAYMENT` / `X-PAYMENT-RESPONSE`) is also supported. Turingate never holds funds: payments go directly from the agent's wallet to the site's `payTo` address.
