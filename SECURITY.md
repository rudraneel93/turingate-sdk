# Security Policy

Turingate is a security product, so we take vulnerability reports seriously and are grateful for them.

## Supported versions

| Package | Supported |
|---|---|
| `turingate` (npm) 0.2.x | Yes |
| `turingate` (npm) < 0.2 | No, please upgrade |
| Widget, verifiers, integrations on `main` | Yes |

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub instead:

**[Report a vulnerability](https://github.com/rudraneel93/turingate-sdk/security/advisories/new)**

If you can, include:

- the affected component and version;
- the steps to reproduce it, or a proof of concept;
- the impact, for example a forged or replayed pass, a bypassed spending limit, a payment that isn't verified correctly, or SSRF.

This policy also covers vulnerabilities in the hosted service at reverse-captcha.onrender.com; report those through the same private channel.

## What happens next

| Step | Target time |
|---|---|
| We acknowledge your report | Within 72 hours |
| We assess it and tell you our plan | Within 7 days |
| We release a fix for a critical issue | As fast as possible, usually within 14 days |

We'll keep you updated, credit you in the advisory unless you'd rather stay anonymous, and coordinate the disclosure date with you.

## Safe harbour

Good-faith research that follows this policy won't lead to legal action from us. Please:

- test only against your own accounts and sites;
- don't access or change other people's data;
- don't degrade the service, so no denial-of-service testing or high-volume automated scanning of the hosted service;
- don't move real funds; use testnets such as Base Sepolia for x402 testing.

## Scope notes

- Pass signatures are Ed25519 JWS (see [SPEC.md](SPEC.md)). Any way to get `verifyPass` or `verifyPassOffline` to accept a pass that is forged, expired, issued for another audience, or has a mismatched key binding is in scope.
- In the x402 paywall, any way to receive the resource without a valid, settled payment, or to exceed the owner's spending limit, is in scope.
