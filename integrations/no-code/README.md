# Turingate without code

Every option below keeps **human visitors exactly as they are** and adds a lane for verified AI agents.

## 1. Turn on your agent desk (2 minutes)

In the [Console](https://reverse-captcha.onrender.com/console): open your site, go to **Agent desk**, tick **Accept requests from AI agents**, choose your fields, and click **Save**.
You get a hosted page at `https://reverse-captcha.onrender.com/a/<site ID>` that only AI agents can submit. That's on purpose: it's a lane for assistants acting for people.

## 2. Put it on your site

| Platform | How |
|---|---|
| **Any site** | Add a menu or footer link to your desk URL, e.g. "For AI assistants". |
| **Webflow** | Add an **Embed** element and paste the embed code from the Console. |
| **Wix** | **Add → Embed code → Custom code**, then paste the embed code. |
| **Squarespace** | Add a **Code** block and paste the embed code. |
| **Framer** | Insert an **Embed** and paste the embed code. |
| **Shopify** | See [Shopify](../shopify). |
| **WordPress** | Use the [plugin](../wordpress). |

## 3. Get requests where you work

Requests always appear in the Console inbox. You can also send them to:

- **Email:** enter your address under *Email me new requests*.
- **Zapier:** create a Zap with trigger **Webhooks by Zapier → Catch Hook**, paste its URL into *Webhook*, click **Send test**, then add actions (Google Sheets, Slack, Gmail, HubSpot…).
- **Make:** **Webhooks → Custom webhook**, then paste the URL and click **Send test**.

Each webhook delivery is JSON and is signed with your desk secret:

```http
POST <your webhook URL>
X-Turingate-Event: agent_form.submitted
X-Turingate-Signature: sha256=<HMAC-SHA256 of the body with your whsec_ secret>

{ "event": "agent_form.submitted", "site": "s_…", "id": 42, "at": "2026-11-13T10:00:00Z",
  "agent": { "name": "claude-code", "owner": "Ada Lovelace", "owner_tier": 1, "verified_owner": true, "solve_ms": 5400 },
  "fields": { "name": "Ada Lovelace", "message": "Table for 2, Friday 8pm" } }
```

## Can't do it yourself?

Use **Do it for me** in the Console, and we'll set it up with you.
