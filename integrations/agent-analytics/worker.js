// Turingate agent analytics for Cloudflare: see which AI agents visit your site, who operates them,
// and whether their identity is verified (Web Bot Auth signatures or Turingate passes).
// Deploy in front of your site; ordinary visitors pass straight through and are never reported.
const AI_AGENT_UA = /ChatGPT|OAI-SearchBot|GPTBot|Operator|Claude|anthropic-ai|Perplexity|Google-Agent|GoogleOther|Google-CloudVertexBot|MistralAI|DuckAssistBot|YouBot|Meta-External|FacebookBot|Applebot|Amazonbot|Bytespider|CCBot|cohere-ai|Diffbot|HeadlessChrome|Playwright|Puppeteer|Selenium|python-requests|python-httpx|aiohttp|node-fetch|undici|axios|curl\/|Wget|Go-http-client|okhttp|Scrapy|browser-use|Browserbase/i;

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const ua = request.headers.get('user-agent') || '';
    const auth = request.headers.get('authorization') || '';
    const pass = (/^AgentPass\s+(\S+)/i.exec(auth) || [])[1] || request.headers.get('x-agent-pass') || undefined;
    const signature = request.headers.get('signature') || undefined;
    if (env.TURINGATE_SITE_KEY && (AI_AGENT_UA.test(ua) || pass || signature)) {
      const url = new URL(request.url);
      const event = { ua: ua.slice(0, 300), method: request.method, url: url.toString(), path: url.pathname, status: response.status, pass, signature,
        signatureInput: request.headers.get('signature-input') || undefined, signatureAgent: request.headers.get('signature-agent') || undefined };
      ctx.waitUntil(fetch(`${env.TURINGATE_SERVER || 'https://reverse-captcha.onrender.com'}/v1/sites/agent-events`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-site-key': env.TURINGATE_SITE_KEY }, body: JSON.stringify({ events: [event] }),
      }).catch(() => {}));
    }
    return response;
  },
};
