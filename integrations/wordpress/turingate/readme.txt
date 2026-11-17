=== Turingate – Agent Lane ===
Contributors: rudraneel93
Tags: ai agents, captcha, bots, woocommerce, mcp
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Let verified AI agents use your site (requests, bookings, your REST API and WooCommerce) while human visitors see no change.

== Description ==

People increasingly send AI assistants such as ChatGPT, Claude and Perplexity to shop, book and ask questions for them. Most sites either block those assistants (and lose the customer) or let every bot in (and get scraped).

Turingate is a **reverse CAPTCHA**: a test only AI can pass. An agent that passes carries a short-lived, signed pass naming the verified person or company behind it, what they allowed it to do, and its spending limit. Your site can let good agents in, and abusive agents are blocked on every Turingate site at once.

This plugin gives your WordPress site an **agent lane**:

* **Agent desk.** Put `[turingate_agent_desk]` on any page. AI agents send requests for their users there (bookings, quotes, questions), and you get them under *Agent requests* and by email. People can't submit it, so it stays free of form spam.
* **REST API and WooCommerce lane.** Optionally verify every REST request that carries `Authorization: AgentPass …`, including WooCommerce checkout, which is checked against the owner's spending limit.
* **Report abuse** with one click. Repeated reports block the agent and its owner across the Turingate network.
* **Never affects people.** Visitors, logged-in users and your own pages are never asked for a pass.

Want to know how ready your site is for AI agents first? Run the free check: https://reverse-captcha.onrender.com/check

You need a free Turingate account (50 agent passes a month free): https://reverse-captcha.onrender.com/console

The plugin's source code, the widget and the pass specification are open source: https://github.com/rudraneel93/turingate-sdk

== Installation ==

1. Install the plugin from Plugins → Add New (search for "Turingate"), or upload the zip, then activate it.
2. Go to Settings → Turingate and paste your Site ID and API key from the Turingate Console.
3. Click **Test connection**.
4. Add `[turingate_agent_desk]` to a page such as "For AI assistants". Optionally turn on the REST API / WooCommerce agent lane.

== Frequently Asked Questions ==

= Will my human visitors ever see a CAPTCHA? =

No. Only AI agents are asked for a pass. Visitors, logged-in users and requests from your own pages are never affected.

= Do I need to know how to code? =

No. Paste two values in the settings and add a shortcode to a page. The REST lane is a single checkbox.

= What does an agent pass contain? =

A signed token (Ed25519/JWS) with the agent's name, the verified owner (person or company), the owner's verification level, allowed scopes, an optional spending limit, and an expiry. The plugin verifies it with the Turingate API before letting the agent act.

= Does this block search engines or AI crawlers? =

No. It doesn't change robots.txt or block any crawler. It only adds an agent lane and, if you choose, requires a pass for anonymous REST writes.

= Is it free? =

The plugin is free and open source. A Turingate account is free for 50 agent passes a month, with paid plans for more.

== External services ==

This plugin relies on the Turingate service (https://reverse-captcha.onrender.com, or another Turingate server you set in Settings) to verify AI agents. It is required for the plugin to work.

* **Verifying a pass:** when an AI agent submits the agent desk form, or sends a REST request with `Authorization: AgentPass …`, the plugin sends the pass token, your Site ID and API key, and the action being attempted (the scope, and the order amount for WooCommerce checkout) to the Turingate API (`/v1/verify`). No data about your human visitors is sent.
* **Reporting abuse:** when you click "Report abuse" on an agent request, the plugin sends that request's pass token and the outcome you chose (`/v1/reports`).
* **Testing the connection:** when you click "Test connection" in Settings, the plugin sends your Site ID and API key.
* **Agent challenge:** the agent desk page shows the Turingate widget (bundled with this plugin). When an AI agent uses it, the agent's browser requests a challenge from the Turingate API and submits its answers there to receive a pass.

Service terms: https://reverse-captcha.onrender.com/terms
Privacy policy: https://reverse-captcha.onrender.com/privacy

== Changelog ==

= 0.2.0 =
* The widget script is now bundled with the plugin instead of loaded from the service.
* "Test connection" is protected with a nonce.
* Tested with WordPress 7.1.

= 0.1.0 =
* First release: agent desk, REST/WooCommerce agent lane, abuse reporting.

== Upgrade Notice ==

= 0.2.0 =
Bundles the widget locally and hardens the settings page. Recommended for all users.
