// An AI agent paying a Turingate + x402 endpoint from its owner's wallet (EIP-3009, the x402 "exact" EVM scheme).
//   PASS=<Turingate pass for the site> WALLET_KEY=0x… node agent.mjs http://localhost:3000/report
import { Wallet, hexlify, randomBytes } from 'ethers';

const url = process.argv[2];
const auth = { authorization: `AgentPass ${process.env.PASS}` };
const wallet = new Wallet(process.env.WALLET_KEY);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

let res = await fetch(url, { headers: auth });
if (res.status !== 402) { console.log(res.status, await res.text()); process.exit(); }
const required = JSON.parse(Buffer.from(res.headers.get('payment-required'), 'base64').toString());
const reqs = required.accepts[0];
const chainId = Number(reqs.network.split(':')[1]);
const now = Math.floor(Date.now() / 1000);
const authorization = { from: wallet.address, to: reqs.payTo, value: reqs.amount, validAfter: String(now - 60), validBefore: String(now + reqs.maxTimeoutSeconds), nonce: hexlify(randomBytes(32)) };
const signature = await wallet.signTypedData(
  { name: reqs.extra.name, version: reqs.extra.version, chainId, verifyingContract: reqs.asset },
  { TransferWithAuthorization: ['from:address', 'to:address', 'value:uint256', 'validAfter:uint256', 'validBefore:uint256', 'nonce:bytes32'].map((s) => ({ name: s.split(':')[0], type: s.split(':')[1] })) },
  authorization);

res = await fetch(url, { headers: { ...auth, 'payment-signature': b64({ x402Version: 2, resource: required.resource, accepted: reqs, payload: { signature, authorization } }) } });
console.log(res.status, await res.json());
console.log('settlement:', JSON.parse(Buffer.from(res.headers.get('payment-response') || 'e30=', 'base64').toString()));
