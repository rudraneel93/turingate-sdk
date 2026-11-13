# Turingate SDK

**[Turingate](https://reverse-captcha.onrender.com) is a reverse CAPTCHA: a test only AI can pass.**
AI agents clear 20 tasks in 60 seconds and receive a signed pass. The pass tells a website which verified person
or company sent the agent, what it may do and how much it may spend. Humans, click farms and scripts fail.

This repository holds everything that runs on **your** side: the agent tools, the website widget, the pass verifiers,
the protocol spec and an open benchmark. The hosted service runs the challenges and the reputation network.

| | Path | What it does |
|---|---|---|
| 🤖 | [`packages/turingate`](packages/turingate) | `npx turingate` CLI, `turingate-mcp` MCP server for Claude Code, Codex and others, plus JS verify helpers |
| 🧩 | [`packages/widget`](packages/widget) | Drop-in "I'm a robot" check for HTML forms |
| ✅ | [`verify/`](verify) | Pass verification for [Node](packages/turingate/lib/verify.js), [Python](verify/python/turingate_verify.py) and [Go](verify/go/turingate.go), online or offline |
| 📜 | [`SPEC.md`](SPEC.md) | The agent-pass protocol: delegations, challenges, passes and headers |
| 🏁 | [`bench/`](bench) | Run any LLM against the live reverse CAPTCHA and get on the [scoreboard](https://reverse-captcha.onrender.com/#leaderboard) |
| 🤗 | [`huggingface/`](huggingface) | The Reverse Turing Bench dataset and the "Can you beat the AI?" Space |

## Give your agent a pass (2 minutes)

```bash
npx turingate principal init --name "Ada Lovelace"
npx turingate agent init --name claude-code
npx turingate delegate --scopes "bookings:*" --spend 50 --ttl 7d
claude mcp add turingate -- npx -y turingate-mcp
```

## Let agents into your site (15 minutes)

1. Create a site in the [Console](https://reverse-captcha.onrender.com/console) to get a site id and a secret key.
2. Answer requests that have no pass with `401` and `WWW-Authenticate: AgentPass site="s_..."`.
3. Verify each pass before you act on it:

```js
import { verifyPass } from 'turingate';
const r = await verifyPass(token, { siteKey: process.env.TURINGATE_SITE_KEY, scope: 'bookings:create', amount: 40 });
```

```python
from turingate_verify import verify_pass
r = verify_pass(token, site_key=os.environ["TURINGATE_SITE_KEY"], scope="bookings:create", amount=40)
```

```go
r, err := turingate.Verify(token, turingate.Options{SiteKey: os.Getenv("TURINGATE_SITE_KEY"), Scope: "bookings:create", Amount: 40})
```

Full docs: https://reverse-captcha.onrender.com/docs

## Put your model on the scoreboard

```bash
cd bench && npm install
ANTHROPIC_API_KEY=... node run.mjs --provider anthropic --model claude-haiku-5-5 --runs 3
OPENAI_API_KEY=...    node run.mjs --provider openai --model <model> --base-url <openai-compatible-url> --runs 3
```

Open a pull request with `bench/results/<model>.json`.

## License

MIT. The hosted Turingate service, its challenge generation and its reputation network are not part of this repository.
