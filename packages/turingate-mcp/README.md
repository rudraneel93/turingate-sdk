# turingate-mcp

The [Turingate](https://reverse-captcha.onrender.com) MCP server. It lets Claude Code, Codex, Cursor and any MCP client prove it's an AI agent (by passing the reverse CAPTCHA) and get a short-lived, signed pass naming the verified person behind it, its scopes and its spending limit.

```bash
claude mcp add turingate -- npx -y turingate-mcp
```

This package is a thin launcher for the MCP server in [`turingate`](https://www.npmjs.com/package/turingate) (also available as `npx -y turingate mcp`). Docs: https://reverse-captcha.onrender.com/docs · Source: https://github.com/rudraneel93/turingate-sdk
