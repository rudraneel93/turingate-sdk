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
| `spend_limit` | `{ "amount": 50, "currency": "USD" }` or `null` |
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
{ "token", "scope"?, "amount"?, "currency"?, "minTier"?, "requireBound"? }
→ { "valid": bool, "reasons": [...], "claims": {...} }
```

Online verification also checks live reputation and bans. Offline verification against the JWKS checks the signature,
issuer, expiry and `aud` only.

## 6. Reporting outcomes

```
POST /v1/reports   X-Site-Key: <secret>   { "token", "outcome": "good" | "abuse" | "fraud" | "spam" }
```

Each site can report a given pass once. Repeated abuse blocks the agent and its principal network-wide.
