import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { verifyWebBotAuth, signWebBotAuth, jwkThumbprint } from '../index.js';

test('RFC 8037 thumbprint of the RFC 9421 Ed25519 test key', () => {
  assert.equal(jwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs' }), 'poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U');
});

test('sign and verify a Web Bot Auth request', async () => {
  const key = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  const pub = { kty: 'OKP', crv: 'Ed25519', x: key.x };
  const fetchJson = async () => ({ keys: [pub] });
  const url = 'https://shop.example/';
  const headers = signWebBotAuth({ url, privateJwk: key, agentUrl: 'https://agent.example' });
  assert.equal((await verifyWebBotAuth({ url, headers }, { fetchJson })).verified, true);
  assert.equal((await verifyWebBotAuth({ url: 'https://other.example/', headers }, { fetchJson })).verified, false);
});
