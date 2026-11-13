# Turingate for Shopify (no code)

Let AI shopping assistants send order requests for real customers, while your human shoppers see no change.

1. In the [Turingate Console](https://reverse-captcha.onrender.com/console), open your site, turn on the **Agent desk**, and choose fields such as "Order details" and "Shipping address". Switch on **Only agents with a verified owner**.
2. **Quickest:** Shopify admin → **Online Store → Navigation → Main menu → Add menu item**. Name it "For AI assistants" and link it to your desk URL, `https://reverse-captcha.onrender.com/a/<your site ID>`.
3. **In your theme (optional):** **Online Store → Themes → … → Edit code → Sections → Add a new section** named `turingate-agent-desk`, paste [`turingate-agent-desk.liquid`](turingate-agent-desk.liquid), then add the section to a page in the theme editor and enter your Site ID.
4. Requests arrive in the Console inbox and by email. To turn them into draft orders or Slack alerts, connect the desk's **webhook** to Zapier or Make (see [no-code](../no-code)).

A native Shopify app with full agent checkout (Storefront API, with the owner's spending limit enforced) is on the roadmap.
