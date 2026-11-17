// Turingate widget. Drop-in:
//   <form> ... <div data-reverse-captcha data-site="s_..."></div> ... </form>
//   <script src="https://YOUR-SERVER/widget.js" defer></script>
// On pass: a hidden input "rc-pass" (the signed pass token) is added to the
// enclosing form and an "rc:pass" event fires. Humans get "rc:fail".
(() => {
  const script = document.currentScript;
  const DEFAULT_SERVER = script ? new URL(script.src).origin : location.origin;

  const MARK = '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 58V30a19 19 0 0 1 38 0v28" stroke="#2ee6f0" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M17 38l8 8L54 11" stroke="#7c5cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="17" cy="38" r="3.5" fill="#7c5cff"/><circle cx="25" cy="46" r="4" fill="#4fa8f6"/><circle cx="54" cy="11" r="5" fill="#b6ff6b"/></svg>';

  const CSS = `
.rc-root{--rc-bg:#fbfbfa;--rc-fg:#1d1d1b;--rc-mute:#6b6b66;--rc-line:#d9d8d2;--rc-acc:#3b5bdb;--rc-ok:#2b8a3e;--rc-bad:#c92a2a;
  font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--rc-fg);background:var(--rc-bg);
  border:1px solid var(--rc-line);border-radius:10px;padding:14px 16px;max-width:520px;box-sizing:border-box}
@media (prefers-color-scheme:dark){.rc-root{--rc-bg:#1c1c1f;--rc-fg:#ececea;--rc-mute:#9a9a95;--rc-line:#34343a;--rc-acc:#7d97ff;--rc-ok:#69db7c;--rc-bad:#ff8787}}
.rc-root *{box-sizing:border-box}
.rc-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.rc-check{display:flex;align-items:center;gap:10px;background:none;border:0;color:inherit;font:inherit;font-size:15px;cursor:pointer;padding:4px 0}
.rc-check:disabled{cursor:default}
.rc-box{width:24px;height:24px;border:2px solid var(--rc-mute);border-radius:5px;display:grid;place-items:center;flex:none}
.rc-busy .rc-box{border-color:var(--rc-acc);border-top-color:transparent;border-radius:50%;animation:rc-spin .8s linear infinite}
.rc-pass .rc-box{border-color:var(--rc-ok);background:var(--rc-ok)} .rc-pass .rc-box::after{content:"✓";color:var(--rc-bg);font-weight:700}
.rc-fail .rc-box{border-color:var(--rc-bad);background:var(--rc-bad)} .rc-fail .rc-box::after{content:"✕";color:var(--rc-bg);font-weight:700}
@keyframes rc-spin{to{transform:rotate(360deg)}}
.rc-brand{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--rc-mute);text-decoration:none;letter-spacing:-.01em}
.rc-brand svg{width:18px;height:18px}.rc-brand b{font-weight:700}
.rc-panel:empty{display:none} .rc-panel{margin-top:12px;border-top:1px solid var(--rc-line);padding-top:12px}
.rc-timer{height:4px;background:var(--rc-line);border-radius:2px;margin:6px 0 10px;overflow:hidden}
.rc-timer i{display:block;height:100%;background:var(--rc-acc);width:calc(var(--p,1)*100%)}
.rc-time{font-variant-numeric:tabular-nums;color:var(--rc-mute);font-size:12px}
.rc-tasks{display:grid;gap:8px;max-height:340px;overflow:auto;padding-right:4px}
.rc-task{display:grid;gap:3px} .rc-q{font-size:13px}
.rc-img{width:100%;max-width:360px;border-radius:8px;display:block;border:1px solid var(--rc-line)}
.rc-task input{font:inherit;padding:5px 8px;border:1px solid var(--rc-line);border-radius:6px;background:transparent;color:inherit;width:100%}
.rc-task input:focus{outline:2px solid var(--rc-acc);outline-offset:-1px}
.rc-right input{border-color:var(--rc-ok)} .rc-wrong input{border-color:var(--rc-bad);text-decoration:line-through}
.rc-btn{font:inherit;padding:7px 12px;border-radius:6px;border:1px solid var(--rc-acc);background:var(--rc-acc);color:var(--rc-bg);cursor:pointer;margin-top:4px}
.rc-btn.rc-ghost{background:transparent;color:var(--rc-acc)}
.rc-ok{color:var(--rc-ok);font-weight:600;margin:0} .rc-bad{color:var(--rc-bad);font-weight:600;margin:0}
.rc-sub{color:var(--rc-mute);margin:4px 0 10px}
.rc-shame{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0} .rc-shame input{flex:1;min-width:140px;font:inherit;padding:6px 8px;border:1px solid var(--rc-line);border-radius:6px;background:transparent;color:inherit}
`;

  function injectCss() {
    if (document.getElementById('rc-style')) return;
    const s = document.createElement('style');
    s.id = 'rc-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  }

  async function post(server, path, body) {
    const r = await fetch(server + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  function render(root, opts = {}) {
    injectCss();
    const server = opts.server || root.dataset.server || DEFAULT_SERVER;
    const fieldName = opts.fieldName || root.dataset.field || 'rc-pass';
    root.className = 'rc-root';
    root.replaceChildren();
    const label = el('span', {}, "I'm a robot");
    const box = el('button', { class: 'rc-check', type: 'button', 'aria-label': "I'm a robot" }, el('span', { class: 'rc-box' }), label);
    const panel = el('div', { class: 'rc-panel', 'aria-live': 'polite' });
    const brand = el('a', { class: 'rc-brand', href: `${server}/`, target: '_blank', rel: 'noopener', title: 'Turingate: the reverse CAPTCHA' });
    brand.innerHTML = MARK; // static, trusted markup
    brand.append('turin', el('b', {}, 'gate'));
    root.append(el('div', { class: 'rc-row' }, box, brand), panel);
    const emit = (type, detail) => root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));

    let started = false;
    box.addEventListener('click', async () => {
      if (started) return;
      started = true;
      box.disabled = true;
      root.classList.add('rc-busy');
      let ch;
      try {
        ch = await post(server, '/v1/challenges', (opts.site || root.dataset.site) ? { site: opts.site || root.dataset.site } : {});
      } catch (e) {
        root.classList.remove('rc-busy');
        panel.replaceChildren(el('p', { class: 'rc-bad' }, e.message));
        started = false; box.disabled = false;
        return;
      }

      const bar = el('i');
      const time = el('span', { class: 'rc-time' });
      const form = el('form', { class: 'rc-tasks', novalidate: '' });
      const rows = {};
      ch.tasks.forEach((t, i) => {
        rows[t.id] = el('label', { class: 'rc-task' },
          el('span', { class: 'rc-q' }, `${i + 1}. ${t.prompt}`),
          t.image ? el('img', { class: 'rc-img', src: server + t.image, alt: 'Abstract image with a question hidden in its pixels', loading: 'lazy' }) : null,
          el('input', { name: t.id, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' }));
        form.append(rows[t.id]);
      });
      form.append(el('button', { type: 'submit', class: 'rc-btn' }, 'Submit answers'));
      panel.replaceChildren(
        el('div', { class: 'rc-row' },
          el('span', {}, `${ch.tasks.length} questions, ${ch.timeLimitMs / 1000}s. Any AI can. Can you?`), time),
        el('div', { class: 'rc-timer' }, bar), form);
      form.querySelector('input')?.focus();

      const deadline = Date.now() + ch.timeLimitMs;
      let done = false;
      const tick = setInterval(() => {
        const left = Math.max(0, deadline - Date.now());
        time.textContent = `${(left / 1000).toFixed(1)}s`;
        bar.style.setProperty('--p', String(left / ch.timeLimitMs));
        if (left <= 0) finish();
      }, 100);
      form.addEventListener('submit', (e) => { e.preventDefault(); finish(); });

      async function finish() {
        if (done) return;
        done = true;
        clearInterval(tick);
        const answers = Object.fromEntries(new FormData(form));
        form.querySelectorAll('input,button').forEach((n) => { n.disabled = true; });
        let r;
        try {
          r = await post(server, `/v1/challenges/${ch.challengeId}/solve`, { answers });
        } catch (e) {
          root.classList.remove('rc-busy');
          panel.prepend(el('p', { class: 'rc-bad' }, e.message));
          return;
        }
        root.classList.remove('rc-busy');
        for (const [id, ok] of Object.entries(r.results)) rows[id]?.classList.add(ok ? 'rc-right' : 'rc-wrong');
        const stats = `${r.correct}/${r.total} correct in ${(r.elapsedMs / 1000).toFixed(1)}s`;

        if (r.passed) {
          root.classList.add('rc-pass');
          label.textContent = 'Robot verified';
          const host = root.closest('form');
          if (host) {
            host.querySelector(`input[name="${fieldName}"]`)?.remove();
            host.append(el('input', { type: 'hidden', name: fieldName, value: r.passToken }));
          }
          panel.replaceChildren(el('p', { class: 'rc-ok' }, `${r.verdict} ${stats}.`));
          opts.onPass?.(r);
          emit('rc:pass', r);
          return;
        }

        root.classList.add('rc-fail');
        label.textContent = 'Human detected';
        const retry = el('button', { type: 'button', class: 'rc-btn rc-ghost' }, "Try again (you'll fail)");
        retry.addEventListener('click', () => render(root, opts));
        const head = [el('p', { class: 'rc-bad' }, r.verdict), el('p', { class: 'rc-sub' }, `${stats}. Access denied, human.`)];
        if (r.hallOfShame?.eligible) {
          const nick = el('input', { placeholder: 'Your name for the Hall of Shame', maxlength: '32' });
          const join = el('button', { type: 'button', class: 'rc-btn' }, 'Join the Hall of Shame');
          const shame = el('div', { class: 'rc-shame' }, nick, join);
          join.addEventListener('click', async () => {
            join.disabled = true;
            try {
              const entry = await post(server, '/v1/hall-of-shame', { challengeId: r.hallOfShame.challengeId, nickname: nick.value });
              shame.replaceChildren(el('p', { class: 'rc-sub' }, `${entry.nickname} is now officially, verifiably human.`));
              emit('rc:shame', entry);
            } catch (e) { join.disabled = false; shame.append(el('p', { class: 'rc-bad' }, e.message)); }
          });
          head.push(shame);
        }
        head.push(retry);
        panel.prepend(...head);
        opts.onFail?.(r);
        emit('rc:fail', r);
      }
    });
  }

  window.ReverseCaptcha = { render };
  const auto = () => document.querySelectorAll('[data-reverse-captcha]').forEach((n) => render(n));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
