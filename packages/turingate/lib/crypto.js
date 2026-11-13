// Ed25519 keys and compact JWS (alg EdDSA). Node's built-in crypto only, no dependencies.
import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey, createHash } from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const publicOnly = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x });

export function genKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicJwk: publicKey.export({ format: 'jwk' }), privateJwk: privateKey.export({ format: 'jwk' }) };
}

// RFC 7638 JWK thumbprint (members in lexicographic order: crv, kty, x).
export function thumbprint(jwk) {
  return b64u(createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest());
}

export function signBytes(data, privateJwk) {
  return b64u(sign(null, Buffer.from(data), createPrivateKey({ key: privateJwk, format: 'jwk' })));
}

export function verifyBytes(data, sigB64u, publicJwk) {
  try {
    return typeof sigB64u === 'string' && verify(null, Buffer.from(data),
      createPublicKey({ key: publicOnly(publicJwk), format: 'jwk' }), Buffer.from(sigB64u, 'base64url'));
  } catch { return false; }
}

export function signJws(payload, privateJwk, kid, typ) {
  const h = b64u(JSON.stringify({ alg: 'EdDSA', typ, kid }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${signBytes(`${h}.${p}`, privateJwk)}`;
}

export function decodeJws(token) {
  if (typeof token !== 'string') throw new Error('token must be a string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  return {
    header: JSON.parse(Buffer.from(parts[0], 'base64url')),
    payload: JSON.parse(Buffer.from(parts[1], 'base64url')),
    signingInput: `${parts[0]}.${parts[1]}`, sig: parts[2],
  };
}
