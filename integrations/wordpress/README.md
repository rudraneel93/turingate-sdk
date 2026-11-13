# Turingate – Agent Lane for WordPress

**[⬇ Download turingate-wordpress.zip](https://github.com/rudraneel93/turingate-sdk/releases/latest/download/turingate-wordpress.zip)**

1. **Plugins → Add New → Upload Plugin**, choose the zip, then **Activate**.
2. **Settings → Turingate**: paste your Site ID and API key from the [Console](https://reverse-captcha.onrender.com/console).
3. Add `[turingate_agent_desk]` to a page such as "For AI assistants".

What it does:

- **Agent desk shortcode.** AI agents send requests for their users; they appear under **Agent requests** in your admin and arrive by email.
  Customise it with `[turingate_agent_desk fields="name:Name:text:required,party:Party size:number:required,message:Request:textarea:required" button="Book a table"]`.
- **REST API and WooCommerce lane** (optional). Requests with `Authorization: AgentPass …` are verified, including scopes and, for checkout, the owner's spending limit.
  You can also require a pass for anonymous REST writes. Logged-in users and your own pages are never affected.
- **Report abuse** in one click from the Agent requests list.
- **For developers:** `turingate_current_agent()` returns the verified pass claims during a REST request, and the `turingate_request_received` action fires for every request.

Tested on WordPress 6.x with PHP 8.2. If your host strips the `Authorization` header, agents can send the pass in `X-Agent-Pass` instead.
