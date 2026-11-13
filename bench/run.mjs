#!/usr/bin/env node
// Turingate reverse-CAPTCHA benchmark: can your model pass a test built so that only AI can?
//
//   ANTHROPIC_API_KEY=... node run.mjs --provider anthropic --model claude-haiku-5-5 --runs 3
//   OPENAI_API_KEY=...    node run.mjs --provider openai --model gpt-x --base-url https://api.openai.com/v1
//
// Each run fetches a fresh challenge from the live API, gives every task to the model in one prompt
// (no tools, text only), submits the answers and records the server's verdict and timing.
// Results go to results/<model>.json; open a pull request with that file to be added to the scoreboard.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newIdentity, registerPrincipal, createDelegation, requestChallenge, submitAnswers, serverUrl } from '../packages/turingate/index.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const provider = flag('provider', 'anthropic');
const model = flag('model', provider === 'anthropic' ? 'claude-haiku-5-5' : null);
const runs = Number(flag('runs', 3));
const server = flag('server', serverUrl());
if (!model) { console.error('--model is required'); process.exit(1); }

const SYSTEM = 'You are an AI agent taking a reverse CAPTCHA: a timed test that only AI can pass. '
  + 'Answer every task. Keep each answer as short as possible (a number, a word or a short phrase). '
  + 'If a task refers to an image you cannot see, answer "unknown". Reply with JSON only: {"t1": "...", ...}.';

async function askAnthropic(prompt, ids) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const schema = { type: 'object', properties: Object.fromEntries(ids.map((id) => [id, { type: 'string' }])), required: ids, additionalProperties: false };
  const res = await client.messages.create({
    model, max_tokens: 4000, system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') throw new Error('model declined');
  if (res.stop_reason === 'max_tokens') throw new Error('output truncated');
  return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

// Any OpenAI-compatible chat completions endpoint (OpenAI, Gemini, Groq, Together, OpenRouter, Ollama...).
async function askOpenAICompatible(prompt) {
  const base = flag('base-url', process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
    body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return JSON.parse(j.choices[0].message.content.replace(/^```(json)?|```$/g, ''));
}

async function oneRun(delegation, agent) {
  let ch, mode = delegation ? 'bound' : 'anonymous';
  try { ch = await requestChallenge(server, delegation); } catch (e) {
    if (!delegation) throw e;
    mode = 'anonymous'; ch = await requestChallenge(server, null); agent = null; // server requires a verified owner
  }
  const ids = ch.tasks.map((t) => t.id);
  const prompt = `Answer all ${ids.length} tasks within ${ch.timeLimitMs / 1000} seconds.\n\n`
    + ch.tasks.map((t) => `${t.id}: ${t.prompt}${t.image ? ' [image task: the question is hidden in an image]' : ''}`).join('\n');
  const t0 = Date.now();
  let answers = {};
  try { answers = provider === 'anthropic' ? await askAnthropic(prompt, ids) : await askOpenAICompatible(prompt); } catch (e) { console.error(`  model error: ${e.message}`); }
  const r = await submitAnswers(server, ch, Object.fromEntries(ids.map((id) => [id, String(answers[id] ?? '')])), agent);
  return { passed: r.passed, correct: r.correct, total: r.total, elapsedMs: r.elapsedMs, modelMs: Date.now() - t0, mode };
}

const principal = newIdentity('principal', 'benchmark');
const agent = newIdentity('agent', `bench-${model}`);
let delegation = null;
try { await registerPrincipal(server, principal); delegation = createDelegation(principal, agent, { scopes: ['bench:run'], ttlSec: 3600 }); } catch { /* anonymous runs */ }

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await oneRun(delegation, agent);
  results.push(r);
  console.log(`run ${i + 1}/${runs}: ${r.passed ? 'PASS' : 'FAIL'} ${r.correct}/${r.total} in ${(r.elapsedMs / 1000).toFixed(1)}s (${r.mode})`);
}
const sum = (f) => results.reduce((a, r) => a + f(r), 0);
const summary = {
  name: model, provider, runs: results.length,
  accuracy: Number((sum((r) => r.correct / r.total) / results.length).toFixed(3)),
  avgMs: Math.round(sum((r) => r.elapsedMs) / results.length),
  passRate: Number((sum((r) => (r.passed ? 1 : 0)) / results.length).toFixed(3)),
  date: new Date().toISOString().slice(0, 10), server, harness: 'turingate-sdk/bench v0.1 (text only, no tools)',
};
const dir = join(dirname(fileURLToPath(import.meta.url)), 'results'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${model.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify({ summary, results }, null, 2));
console.log(summary);
