import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let createModelSettingsTools;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createModelSettingsTools } = await server.ssrLoadModule('/src/models/settings-tools.ts'));
});
test.after(async () => { await server?.close(); });

test('settings tools use the host model endpoints once with normalized URLs and the current host headers', async () => {
  const oldST = globalThis.SillyTavern; const oldLuker = globalThis.Luker;
  const requests = [];
  try {
    globalThis.SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'stub-token' }) }) };
    const tools = createModelSettingsTools(async (url, init) => {
      requests.push({ url, init });
      return url.endsWith('/status')
        ? new Response(JSON.stringify({ data: [{ id: 'model-a' }] }))
        : new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    });
    const profile = { url: 'https://models.example/', model: 'model-a', key: 'stub-key' };
    assert.deepEqual(await tools.fetchModels({ ...profile, model: '' }), ['model-a']);
    await tools.testConnection(profile);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, '/api/backends/chat-completions/status');
    assert.equal(requests[1].url, '/api/backends/chat-completions/generate');
    const statusBody = JSON.parse(requests[0].init.body);
    const testBody = JSON.parse(requests[1].init.body);
    assert.equal(statusBody.reverse_proxy, 'https://models.example/v1');
    assert.equal(statusBody.proxy_password, 'stub-key');
    assert.equal(testBody.model, 'model-a');
    assert.equal(new Headers(requests[1].init.headers).get('x-csrf-token'), 'stub-token');
    const leakingError = createModelSettingsTools(async () => new Response(JSON.stringify({ error: { message: 'rejected stub-key because of auth' } })));
    await assert.rejects(leakingError.testConnection(profile), error => !error.message.includes('stub-key') && /测试连接失败/.test(error.message));
  } finally {
    if (oldST === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = oldST;
    if (oldLuker === undefined) delete globalThis.Luker; else globalThis.Luker = oldLuker;
  }
});

test('fetching models requires only URL and Key and sends no request when either is blank', async () => {
  const requests = [];
  const tools = createModelSettingsTools(async (...args) => { requests.push(args); return new Response(JSON.stringify({ data: [{ id: 'model-a' }] })); });
  assert.deepEqual(await tools.fetchModels({ url: 'https://models.example', key: 'stub-key', model: '' }), ['model-a']);
  await assert.rejects(tools.fetchModels({ url: '', key: 'stub-key', model: '' }), /请先填写API地址和Key/);
  await assert.rejects(tools.fetchModels({ url: 'https://models.example', key: '', model: '' }), /请先填写API地址和Key/);
  assert.equal(requests.length, 1);
});
