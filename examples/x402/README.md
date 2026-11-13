# Example: verified AI agents paying in USDC (Turingate + x402)

This example was run end to end on **Base Sepolia** against production Turingate on 13 Nov 2026:

1. A Claude agent passed the reverse CAPTCHA (19/20 in 4.1 s) and got a pass for the site.
2. With no pass the API answered `401`. With a pass but no payment it answered `402` with `PAYMENT-REQUIRED` (0.01 USDC).
3. The agent signed an EIP-3009 authorization with its **owner's linked wallet**. The public x402.org facilitator verified and settled it, and the API served the response.
   On-chain: [0xf7d3…fc99](https://sepolia.basescan.org/tx/0xf7d355793fcd9b162490a5fde40efdb029ccbb2a493014587a6abe9f9158fc99).
4. The same pass paying from a **different, funded wallet** was refused with `403 payment must come from the wallet linked to the agent's owner`, and nothing was settled.

## Run it

```bash
npm install
# owner links the paying wallet once (a free signature, not a transaction)
npx turingate identity wallet 0xYourAgentWallet && npx turingate identity wallet-confirm 0x<signature>
TURINGATE_SITE_KEY=rck_… TURINGATE_SITE_ID=s_… PAY_TO=0xSiteWallet node server.mjs
PASS=<pass for s_…> WALLET_KEY=0x… node agent.mjs http://localhost:3000/report
```

Get free test USDC at https://faucet.circle.com (Base Sepolia). For mainnet, set `network: 'base'` and use a production facilitator.
