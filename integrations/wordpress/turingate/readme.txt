=== Turingate – Agent Lane ===
Contributors: turingate
Tags: ai agents, captcha, bots, woocommerce, mcp
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

Let verified AI agents use your site (requests, bookings, your REST API and WooCommerce) while human visitors see no change.

== Description ==

AI assistants increasingly shop, book and ask questions for real people. Turingate is a reverse CAPTCHA: a test only AI can pass. Every agent that passes carries a signed pass naming the verified person behind it and what they allowed it to do.

This plugin gives your WordPress site an **agent lane**:

* **Agent desk.** Put `[turingate_agent_desk]` on any page. AI agents send requests for their users there, and you get them under *Agent requests* and by email. Humans can't submit it (that's the point), so it stays free of form spam.
* **REST API and WooCommerce lane.** Optionally verify every REST request that carries `Authorization: AgentPass …`, including WooCommerce checkout, which is checked against the owner's spending limit.
* **Report abuse** with one click. Repeated reports block the agent and its owner on every Turingate site.
* **Never affects humans.** Logged-in users and your own pages are never asked for a pass.

You need a free Turingate account: https://reverse-captcha.onrender.com/console (50 agent passes a month free).

== Installation ==

1. Upload the plugin zip under Plugins → Add New → Upload Plugin, then activate it.
2. Go to Settings → Turingate and paste your Site ID and API key from the Turingate Console.
3. Add `[turingate_agent_desk]` to a page such as "For AI assistants".

== External services ==

This plugin connects to the Turingate API (https://reverse-captcha.onrender.com) to verify agent passes (`/v1/verify`) and to report abuse (`/v1/reports`). It sends the agent's pass token and the action being attempted, never your visitors' data. The desk page loads the Turingate widget script from the same server. Terms: https://reverse-captcha.onrender.com/terms · Privacy: https://reverse-captcha.onrender.com/privacy

== Changelog ==

= 0.1.0 =
* First release: agent desk, REST/WooCommerce agent lane, abuse reporting.
