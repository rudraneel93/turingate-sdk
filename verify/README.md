# Verifying passes

- **Node**: `npm i turingate`, then `import { verifyPass, verifyPassOffline } from 'turingate'`
- **Python**: copy `python/turingate_verify.py` (offline mode needs `pip install cryptography`)
- **Go**: `go get github.com/rudraneel93/turingate-sdk/verify/go`

Use online verification (`verifyPass`) for anything that matters, because it also checks live reputation and bans.
Offline verification checks the signature, issuer, expiry and site only.
