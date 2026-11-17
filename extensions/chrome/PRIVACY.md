# AI Agent Readiness Check: privacy

- The extension does nothing until you click its icon.
- When you click, it sends **only the current site's hostname** (for example `example.com`) to the Turingate checker at reverse-captcha.onrender.com, which checks that public website and returns a score.
- It does not read page content, track your browsing, use cookies or analytics, or send any personal data.
- Permissions: `activeTab` (to read the current tab's address when you click) and access to the checker API.
- Turingate's privacy policy: https://reverse-captcha.onrender.com/privacy
