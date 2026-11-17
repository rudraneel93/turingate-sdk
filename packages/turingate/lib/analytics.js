// Agent traffic analytics: report AI-agent requests to Turingate so the Console shows which agents visit,
// who operates them and whether their identity is proven. Ordinary visitors are never reported.
import { DEFAULT_SERVER } from './client.js';

export const AI_AGENT_UA = /ChatGPT|OAI-SearchBot|GPTBot|Operator|Claude|anthropic-ai|Perplexity|Google-Agent|GoogleOther|Google-CloudVertexBot|MistralAI|DuckAssistBot|YouBot|Meta-External|FacebookBot|Applebot|Amazonbot|Bytespider|CCBot|cohere-ai|Diffbot|HeadlessChrome|Playwright|Puppeteer|Selenium|python-requests|python-httpx|aiohttp|node-fetch|undici|axios|curl\/|Wget|Go-http-client|okhttp|Scrapy|browser-use|Browserbase/i;

// Build an event from any request (Node IncomingMessage, Express, or Fetch API Request). Returns null for ordinary visitors.
export function agentEvent(req, { url } = {}) {
  const get = (k) => (typeof req.headers?.get === 'function' ? req.headers.get(k) : req.headers?.[k]) ?? undefined;
  const ua = get('user-agent') ?? '';
  const auth = String(get('authorization') ?? '');
  const pass = /^AgentPass\s+(\S+)/i.exec(auth)?.[1] ?? get('x-agent-pass');
  const signature = get('signature');
  if (!AI_AGENT_UA.test(ua) && !pass && !signature) return null;
  const full = url ?? (/^https?:\/\//.test(req.url) ? req.url : `https://${get('host')}${req.originalUrl ?? req.url}`);
  return { ua: ua.slice(0, 300), method: req.method, url: full, path: new URL(full).pathname, pass, signature, signatureInput: get('signature-input'), signatureAgent: get('signature-agent') };
}

// Express/Connect/Node middleware. Batches events and sends them every few seconds; never delays the response.
//   app.use(agentAnalytics({ siteKey: process.env.TURINGATE_SITE_KEY }))
export function agentAnalytics({ siteKey, server = DEFAULT_SERVER, flushMs = 5000, maxBatch = 200, fetchImpl = fetch } = {}) {
  if (!siteKey) throw new Error('siteKey is required (from the Turingate Console)');
  let queue = [], timer = null;
  const flush = async () => {
    timer = null;
    const events = queue.splice(0, maxBatch);
    if (!events.length) return;
    try { await fetchImpl(`${server}/v1/sites/agent-events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-site-key': siteKey }, body: JSON.stringify({ events }) }); } catch {}
    if (queue.length) timer = setTimeout(flush, flushMs);
  };
  const mw = (req, res, next) => {
    try {
      const e = agentEvent(req);
      if (e) { queue.push(e); if (queue.length > 5000) queue = queue.slice(-5000); if (queue.length >= maxBatch) flush(); else if (!timer) { timer = setTimeout(flush, flushMs); timer.unref?.(); } }
    } catch {}
    next?.();
  };
  mw.flush = flush;
  return mw;
}
