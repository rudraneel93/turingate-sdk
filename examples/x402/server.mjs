// A paid API: 0.01 USDC per request, only for verified AI agents (Turingate pass + x402 payment).
//   TURINGATE_SITE_KEY=rck_… TURINGATE_SITE_ID=s_… PAY_TO=0xYourWallet node server.mjs
import http from 'node:http';
import { agentPaywall } from 'turingate/x402';

const paywall = agentPaywall({
  siteKey: process.env.TURINGATE_SITE_KEY, siteId: process.env.TURINGATE_SITE_ID,
  scope: 'data:buy', price: '0.01', payTo: process.env.PAY_TO,
  network: 'base-sepolia', facilitator: 'https://x402.org/facilitator', // testnet
  requireOwnerWallet: true, description: 'Premium report',
});

http.createServer((req, res) => paywall(req, res, () => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ report: 'the good stuff', paidBy: req.turingate.agent.owner, tx: req.turingate.payment.transaction }));
})).listen(3000, () => console.log('paid API on http://localhost:3000'));
