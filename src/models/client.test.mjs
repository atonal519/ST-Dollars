import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let createModelClient; let ModelError; let normalizeApiUrl;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ createModelClient, ModelError, normalizeApiUrl } = await server.ssrLoadModule('/src/models/client.ts')); });
test.after(async () => { await server?.close(); });
const profile = { url: 'https://models.example///', model: 'primary', key: 'private-key' };

test('model client uses host forwarding, preserves the owned key, and fails closed for empty keys and HTTP 200 errors', async () => {
  const requests = [];
  const client = createModelClient({ getHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'host-token' }), fetchImpl: async (url, options) => { requests.push([url, options]); return new Response(JSON.stringify({ choices: [{ message: { content: '  {"ok":true}  ' } }] }), { status: 200 }); } });
  assert.equal(await client.generate(profile, [{ role: 'user', content: '{}' }], 2048), '{"ok":true}');
  assert.equal(requests.length, 1); assert.equal(requests[0][0], '/api/backends/chat-completions/generate');
  const payload = JSON.parse(requests[0][1].body);
  const headers = new Headers(requests[0][1].headers);
  assert.equal(headers.get('content-type'), 'application/json'); assert.equal(headers.get('x-csrf-token'), 'host-token');
  assert.equal(payload.reverse_proxy, 'https://models.example/v1'); assert.equal(payload.proxy_password, 'private-key'); assert.equal(payload.stream, false); assert.equal(payload.max_tokens, 2048);
  await assert.rejects(client.generate({ ...profile, key: '' }, [], 10), ModelError);
  assert.equal(requests.length, 1);
  const failed = createModelClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 200 }) });
  await assert.rejects(failed.generate(profile, [], 10), error => error.httpStatus === 200 && /quota exhausted/.test(error.message));
  const stringFailure = createModelClient({ fetchImpl: async () => new Response(JSON.stringify({ error: 'backend unavailable' }), { status: 200 }) });
  await assert.rejects(stringFailure.generate(profile, [], 10), /backend unavailable/);
  const upstreamFailure = createModelClient({ fetchImpl: async () => new Response('upstream failed', { status: 503 }) });
  await assert.rejects(upstreamFailure.generate(profile, [], 10), error => error.httpStatus === 503 && /HTTP 503/.test(error.message));
});

test('model client normalizes shared and independent API URLs using QQJ routing rules', async () => {
  assert.equal(normalizeApiUrl(' https://host.example/// '), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('http://host.example:8123'), 'http://host.example:8123/v1');
  assert.equal(normalizeApiUrl('https://host.example/v1'), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('https://host.example/v1/chat/completions'), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('https://host.example/proxy/openai/'), 'https://host.example/proxy/openai');
  for (const [url, expected] of [['https://host.example', 'https://host.example/v1'], ['https://host.example/chat/completions', 'https://host.example'], ['https://host.example/proxy/v1', 'https://host.example/proxy/v1']]) {
    let payload;
    const client = createModelClient({ fetchImpl: async (_path, init) => { payload = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await client.generate({ ...profile, url }, [], 10);
    assert.equal(payload.reverse_proxy, expected);
  }
});

test('production model client reads forwarding headers from both host context entries', async () => {
  const originalST = globalThis.SillyTavern; const originalLuker = globalThis.Luker;
  try {
    for (const hostName of ['SillyTavern', 'Luker']) {
      let sent;
      if (hostName === 'Luker') delete globalThis.SillyTavern;
      globalThis[hostName] = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': hostName }) }) };
      const client = createModelClient({ fetchImpl: async (_path, init) => { sent = new Headers(init.headers).get('x-csrf-token'); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
      await client.generate(profile, [], 10);
      assert.equal(sent, hostName);
    }
  } finally {
    if (originalST === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = originalST;
    if (originalLuker === undefined) delete globalThis.Luker; else globalThis.Luker = originalLuker;
  }
});
