// Runs only when you click the extension: checks the current tab's site with the free Turingate checker.
const API = 'https://reverse-captcha.onrender.com';
const out = document.getElementById('out');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { pass: '✓', warn: '!', fail: '✕' };

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let u;
  try { u = new URL(tab?.url ?? ''); } catch {}
  if (!u || !/^https?:$/.test(u.protocol)) { out.innerHTML = '<p>Open a website, then click the extension to check it.</p>'; return; }
  document.getElementById('host').textContent = u.hostname;
  try {
    const r = await fetch(`${API}/v1/check`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-turingate-client': 'chrome-extension' }, body: JSON.stringify({ url: u.hostname }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    chrome.action.setBadgeText({ tabId: tab.id, text: String(d.score) });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: d.score >= 70 ? '#1f9d6a' : d.score >= 55 ? '#c98a1a' : '#c2365d' });
    const order = { fail: 0, warn: 1, pass: 2 };
    const checks = d.checks.slice().sort((a, b) => order[a.status] - order[b.status] || b.max - a.max);
    const link = `${API}/check?site=${encodeURIComponent(d.host)}&ref=chrome-extension`;
    out.innerHTML = `<div class="score"><span class="grade ${esc(d.grade)}">${esc(d.grade)}</span><div class="num">${d.score}<small> / 100</small></div></div>
      <p class="sum">${esc(d.summary)}</p>
      <ul>${checks.map((c) => `<li class="${c.status}"><i>${ICON[c.status]}</i><span>${esc(c.title)}</span><em>${c.points}/${c.max}</em></li>`).join('')}</ul>
      <a class="btn" href="${link}" target="_blank" rel="noopener">See fixes and details</a>
      <p class="muted">Checked by Turingate. Only this site's address is sent, and only when you click.</p>`;
  } catch (e) {
    out.innerHTML = `<p class="err">Couldn't check this site: ${esc(e.message)}</p><p class="muted">Try again in a moment.</p>`;
  }
})();
