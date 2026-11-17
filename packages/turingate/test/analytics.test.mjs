import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentAnalytics, agentEvent } from '../index.js';

test('only AI agents (or signed/pass requests) are reported, in batches', async () => {
  assert.equal(agentEvent({ method: 'GET', url: '/', headers: { host: 'shop.example', 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605' } }), null);
  const e = agentEvent({ method: 'GET', url: '/p/1?x=1', headers: { host: 'shop.example', 'user-agent': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0)' } });
  assert.equal(e.path, '/p/1');
  const sent = [];
  const mw = agentAnalytics({ siteKey: 'k', flushMs: 10_000, fetchImpl: async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; } });
  let nexts = 0;
  mw({ method: 'GET', url: '/', headers: { host: 'a', 'user-agent': 'Claude-User/1.0' } }, {}, () => nexts++);
  mw({ method: 'GET', url: '/', headers: { host: 'a', 'user-agent': 'Mozilla/5.0 Chrome/131' } }, {}, () => nexts++);
  await mw.flush();
  assert.equal(nexts, 2);
  assert.equal(sent.length, 1); assert.equal(sent[0].events.length, 1);
});
