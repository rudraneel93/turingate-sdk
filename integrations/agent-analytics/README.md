# Turingate agent analytics

See which **AI agents** visit your site (ChatGPT, Claude, Perplexity, Google, scrapers and automation), **who operates them**, which pages they hit, and whether their identity is **verified**: by a [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/) signature or a Turingate pass, or merely claimed by the user-agent string. Results appear in the [Turingate Console](https://reverse-captcha.onrender.com/console).

Ordinary visitors pass straight through and are never reported. Free on every plan.

## Cloudflare (no code changes to your site)

```bash
git clone https://github.com/rudraneel93/turingate-sdk && cd turingate-sdk/integrations/agent-analytics
# edit wrangler.toml: set your domain in routes
npx wrangler secret put TURINGATE_SITE_KEY   # paste your key from the Console
npx wrangler deploy
```

## Node (Express, Next.js custom server, Fastify via middie)

```js
import { agentAnalytics } from 'turingate';
app.use(agentAnalytics({ siteKey: process.env.TURINGATE_SITE_KEY }));
```

Events are batched and sent every few seconds, never delaying your responses.

## What is sent

For AI-agent requests only: the user-agent, method, URL path, and, if present, the Web Bot Auth headers (`Signature`, `Signature-Input`, `Signature-Agent`) and Turingate pass, so Turingate can verify who the agent really is. No cookies, bodies or visitor data.
