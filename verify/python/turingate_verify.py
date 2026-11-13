"""Verify Turingate agent passes from Python.

Online (recommended): checks signature, expiry, site, scope, amount, tier and live reputation.
Offline: signature, issuer, expiry and site only. Needs `pip install cryptography`.

    from turingate_verify import verify_pass
    r = verify_pass(token, site_key=os.environ["TURINGATE_SITE_KEY"], scope="bookings:create", amount=40)
    if not r["valid"]: abort(403)
"""
import base64
import json
import time
import urllib.request

DEFAULT_SERVER = "https://reverse-captcha.onrender.com"


def _post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def verify_pass(token, *, site_key, scope=None, amount=None, currency=None, min_tier=None,
                require_bound=False, server=DEFAULT_SERVER):
    body = {"token": token}
    if scope:
        body["scope"] = scope
    if amount is not None:
        body["amount"] = amount
    if currency:
        body["currency"] = currency
    if min_tier is not None:
        body["minTier"] = min_tier
    if require_bound:
        body["requireBound"] = True
    return _post(f"{server}/v1/verify", body, {"x-site-key": site_key})


def _b64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


_jwks = {}


def _keys(server):
    c = _jwks.get(server)
    if c and time.time() - c[0] < 3600:
        return c[1]
    with urllib.request.urlopen(f"{server}/.well-known/jwks.json", timeout=10) as r:
        keys = json.loads(r.read())["keys"]
    _jwks[server] = (time.time(), keys)
    return keys


def verify_pass_offline(token, *, site_id=None, server=DEFAULT_SERVER):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature
    try:
        h64, p64, s64 = token.split(".")
        header, claims = json.loads(_b64(h64)), json.loads(_b64(p64))
    except Exception:
        return {"valid": False, "reasons": ["malformed token"]}
    if header.get("alg") != "EdDSA" or header.get("typ") != "rc-pass+jwt":
        return {"valid": False, "reasons": ["not a Turingate pass"]}
    key = next((k for k in _keys(server) if k.get("kid") == header.get("kid")), None)
    if key is None:
        _jwks.pop(server, None)
        key = next((k for k in _keys(server) if k.get("kid") == header.get("kid")), None)
    try:
        Ed25519PublicKey.from_public_bytes(_b64(key["x"])).verify(_b64(s64), f"{h64}.{p64}".encode())
    except (InvalidSignature, TypeError, KeyError):
        return {"valid": False, "reasons": ["bad signature"]}
    reasons = []
    if not isinstance(claims.get("exp"), (int, float)) or time.time() >= claims["exp"]:
        reasons.append("pass expired")
    if claims.get("iss") and claims["iss"].rstrip("/") != server.rstrip("/"):
        reasons.append("wrong issuer")
    if site_id and claims.get("aud") and claims["aud"] != site_id:
        reasons.append("pass was issued for a different site")
    return {"valid": not reasons, "reasons": reasons, "claims": claims}
