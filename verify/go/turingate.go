// Package turingate verifies Turingate agent passes.
//
// Online verification (recommended) checks signature, expiry, site, scope, amount, tier and live
// reputation. Offline verification checks signature, issuer, expiry and site only.
package turingate

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// DefaultServer is the hosted Turingate API.
const DefaultServer = "https://reverse-captcha.onrender.com"

// Result is the verification outcome.
type Result struct {
	Valid   bool           `json:"valid"`
	Reasons []string       `json:"reasons"`
	Claims  map[string]any `json:"claims,omitempty"`
}

// Options for online verification. Zero values mean "not required".
type Options struct {
	SiteKey      string
	Scope        string
	Amount       float64
	Currency     string
	MinTier      int
	RequireBound bool
	Server       string
}

var client = &http.Client{Timeout: 10 * time.Second}

// Verify checks a pass with the Turingate API.
func Verify(token string, o Options) (*Result, error) {
	if o.SiteKey == "" {
		return nil, errors.New("SiteKey is required")
	}
	if o.Server == "" {
		o.Server = DefaultServer
	}
	body := map[string]any{"token": token}
	if o.Scope != "" {
		body["scope"] = o.Scope
	}
	if o.Amount != 0 {
		body["amount"] = o.Amount
	}
	if o.Currency != "" {
		body["currency"] = o.Currency
	}
	if o.MinTier != 0 {
		body["minTier"] = o.MinTier
	}
	if o.RequireBound {
		body["requireBound"] = true
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, o.Server+"/v1/verify", bytes.NewReader(b))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-site-key", o.SiteKey)
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("verify failed: HTTP %d", res.StatusCode)
	}
	var r Result
	return &r, json.NewDecoder(res.Body).Decode(&r)
}

type jwk struct {
	Kid string `json:"kid"`
	X   string `json:"x"`
}

var (
	mu     sync.Mutex
	cached = map[string]struct {
		at   time.Time
		keys []jwk
	}{}
)

func keys(server string, refresh bool) ([]jwk, error) {
	mu.Lock()
	defer mu.Unlock()
	if c, ok := cached[server]; ok && !refresh && time.Since(c.at) < time.Hour {
		return c.keys, nil
	}
	res, err := client.Get(server + "/.well-known/jwks.json")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var set struct{ Keys []jwk }
	if err := json.NewDecoder(res.Body).Decode(&set); err != nil {
		return nil, err
	}
	cached[server] = struct {
		at   time.Time
		keys []jwk
	}{time.Now(), set.Keys}
	return set.Keys, nil
}

func find(ks []jwk, kid string) *jwk {
	for i := range ks {
		if ks[i].Kid == kid {
			return &ks[i]
		}
	}
	return nil
}

// VerifyOffline checks signature, issuer, expiry and (if siteID is set) the site, using the public JWKS.
func VerifyOffline(token, siteID, server string) (*Result, error) {
	if server == "" {
		server = DefaultServer
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return &Result{Reasons: []string{"malformed token"}}, nil
	}
	dec := base64.RawURLEncoding
	hb, err1 := dec.DecodeString(parts[0])
	pb, err2 := dec.DecodeString(parts[1])
	sig, err3 := dec.DecodeString(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return &Result{Reasons: []string{"malformed token"}}, nil
	}
	var h struct{ Alg, Typ, Kid string }
	var c map[string]any
	if json.Unmarshal(hb, &h) != nil || json.Unmarshal(pb, &c) != nil {
		return &Result{Reasons: []string{"malformed token"}}, nil
	}
	if h.Alg != "EdDSA" || h.Typ != "rc-pass+jwt" {
		return &Result{Reasons: []string{"not a Turingate pass"}}, nil
	}
	ks, err := keys(server, false)
	if err != nil {
		return nil, err
	}
	k := find(ks, h.Kid)
	if k == nil {
		if ks, err = keys(server, true); err != nil {
			return nil, err
		}
		k = find(ks, h.Kid)
	}
	if k == nil {
		return &Result{Reasons: []string{"unknown signing key"}}, nil
	}
	pub, err := dec.DecodeString(k.X)
	if err != nil || len(pub) != ed25519.PublicKeySize || !ed25519.Verify(pub, []byte(parts[0]+"."+parts[1]), sig) {
		return &Result{Reasons: []string{"bad signature"}}, nil
	}
	r := &Result{Claims: c}
	if exp, ok := c["exp"].(float64); !ok || float64(time.Now().Unix()) >= exp {
		r.Reasons = append(r.Reasons, "pass expired")
	}
	if iss, _ := c["iss"].(string); iss != "" && strings.TrimRight(iss, "/") != strings.TrimRight(server, "/") {
		r.Reasons = append(r.Reasons, "wrong issuer")
	}
	if aud, _ := c["aud"].(string); siteID != "" && aud != "" && aud != siteID {
		r.Reasons = append(r.Reasons, "pass was issued for a different site")
	}
	r.Valid = len(r.Reasons) == 0
	return r, nil
}
