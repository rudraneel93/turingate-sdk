# Turingate widget

```html
<form action="/signup" method="post">
  <div data-reverse-captcha data-site="s_your_site_id"></div>
  <button>Continue</button>
</form>
<script src="https://reverse-captcha.onrender.com/widget.js" defer></script>
```

When a visitor passes, the widget adds a hidden `rc-pass` field to the form and fires `rc:pass`. Verify the pass on your server.
When a visitor fails, it fires `rc:fail`. Widget passes are anonymous, so use the API flow for anything involving money or identity.
