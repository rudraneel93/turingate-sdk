#!/usr/bin/env node
// MCP server (stdio, zero dependencies) that lets Claude Code / Codex prove
// they're an AI agent and get a scoped pass.
//
//   claude mcp add turingate -- npx -y turingate-mcp
//
// The agent itself solves the challenge: rc_get_challenge returns the tasks,
// the model answers them, and rc_submit_answers signs with the agent key.
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import {
  serverUrl, homeFile, loadIdentity, requestChallenge, submitAnswers, writeSecret, downloadImages,
} from './lib/client.js';
import { decodeJws } from './lib/crypto.js';

const readText = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim() : null);
const pending = new Map(); // challengeId -> challenge (holds the nonce)

const TOOLS = [
  {
    name: 'rc_whoami',
    description: 'Show this agent\'s identity, the human principal it acts for, and its delegated scopes and spend limit.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'rc_get_challenge',
    description: 'Start a reverse-CAPTCHA challenge to prove you are an AI agent. Returns a list of short tasks. '
      + 'Answer ALL of them yourself and immediately call rc_submit_answers: the time limit is tight (built so humans fail). '
      + 'Do not use other tools in between, except to decode image tasks if you asked for them. '
      + 'Optional images (0-3): hidden-ink image tasks whose question is invisible to humans; each adds 30s. '
      + 'They are saved as local PNG files; decode them with code (the format is in the returned instructions).',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'site id (s_...) of the website you want a pass for; the pass is only valid there' },
        images: { type: 'integer', minimum: 0, maximum: 3, description: 'number of hidden-ink image tasks (default 0)' },
      },
    },
  },
  {
    name: 'rc_submit_answers',
    description: 'Submit answers for a challenge. answers maps task id to a short answer string, e.g. {"t1": "42", "t2": "violin"}. '
      + 'On success returns a signed pass token that sites accept as proof this is an accountable agent.',
    inputSchema: {
      type: 'object',
      properties: {
        challenge_id: { type: 'string' },
        answers: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['challenge_id', 'answers'],
    },
  },
  {
    name: 'rc_current_pass',
    description: 'Return the most recent pass token and how to present it to a site (Authorization: AgentPass <token>).',
    inputSchema: { type: 'object', properties: {} },
  },
];

function requireSetup() {
  const agent = loadIdentity('agent');
  const delegation = readText(homeFile('delegation.jwt'));
  if (!agent || !delegation) {
    throw new Error('Not set up. Ask the human to run: npx turingate principal init --name NAME && npx turingate agent init --name NAME && npx turingate delegate --scopes ...');
  }
  return { agent, delegation };
}

async function callTool(name, args) {
  const server = serverUrl();
  switch (name) {
    case 'rc_whoami': {
      const agent = loadIdentity('agent');
      const d = readText(homeFile('delegation.jwt'));
      const c = d ? decodeJws(d).payload : null;
      return {
        server, agent: agent && { id: agent.id, name: agent.name },
        principal: c?.iss ?? null, scopes: c?.scopes ?? [], spend_limit: c?.spend_limit ?? null,
        delegation_expires: c ? new Date(c.exp * 1000).toISOString() : null,
      };
    }
    case 'rc_get_challenge': {
      const { delegation } = requireSetup();
      const ch = await requestChallenge(server, delegation, { images: args.images ?? 0, site: args.site ?? null });
      pending.set(ch.challengeId, ch);
      const files = await downloadImages(server, ch, homeFile('images'));
      const lines = ch.tasks.map((t) => (files[t.id]
        ? `${t.id}: [IMAGE saved at ${files[t.id]}] ${t.prompt}`
        : `${t.id}: ${t.prompt}`)).join('\n');
      const imageHelp = Object.keys(files).length ? `\nImage format: ${ch.instructions.split('Image tasks: ')[1] ?? ''}\n` : '';
      return `challenge_id: ${ch.challengeId}\n`
        + `Answer all ${ch.tasks.length} tasks within ${ch.timeLimitMs / 1000}s (need ${Math.ceil(ch.passThreshold * ch.tasks.length)} correct). `
        + `Short answers only. Then call rc_submit_answers right away.${imageHelp}\n${lines}`;
    }
    case 'rc_submit_answers': {
      const { agent } = requireSetup();
      const ch = pending.get(args.challenge_id);
      if (!ch) throw new Error('unknown challenge_id; call rc_get_challenge first');
      pending.delete(args.challenge_id);
      const r = await submitAnswers(server, ch, args.answers ?? {}, agent);
      if (r.passToken) writeSecret(homeFile('pass.jwt'), r.passToken);
      return {
        passed: r.passed, verdict: r.verdict, score: `${r.correct}/${r.total}`, elapsed_ms: r.elapsedMs,
        pass_token: r.passToken ?? null,
        ...(r.passed ? {} : { wrong: Object.keys(r.results).filter((k) => !r.results[k]) }),
      };
    }
    case 'rc_current_pass': {
      const tok = readText(homeFile('pass.jwt'));
      if (!tok) return 'No pass yet. Call rc_get_challenge.';
      const c = decodeJws(tok).payload;
      const expired = Date.now() / 1000 >= c.exp;
      return {
        expired, expires: new Date(c.exp * 1000).toISOString(), scopes: c.scopes, spend_limit: c.spend_limit,
        header: expired ? null : `Authorization: AgentPass ${tok}`,
      };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function onMessage(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  try {
    switch (method) {
      case 'initialize':
        return send({ id, result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'turingate', version: '0.3.0' },
        } });
      case 'ping':
        return send({ id, result: {} });
      case 'tools/list':
        return send({ id, result: { tools: TOOLS } });
      case 'tools/call': {
        try {
          const r = await callTool(params?.name, params?.arguments ?? {});
          const text = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
          return send({ id, result: { content: [{ type: 'text', text }] } });
        } catch (e) {
          return send({ id, result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true } });
        }
      }
      default:
        return send({ id, error: { code: -32601, message: `method not found: ${method}` } });
    }
  } catch (e) {
    return send({ id, error: { code: -32603, message: e.message } });
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch {
    send({ id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  onMessage(msg);
});
