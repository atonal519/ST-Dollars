import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let getHostContext;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ getHostContext } = await server.ssrLoadModule('/src/host/host-context.ts'));
});
test.after(async () => { await server?.close(); });

test('reads the SillyTavern context when its entry is available', () => {
  const context = { host: 'st' };
  assert.equal(getHostContext({ SillyTavern: { getContext: () => context } }), context);
});

test('reads the Luker context when the SillyTavern entry is absent', () => {
  const context = { host: 'luker' };
  assert.equal(getHostContext({ Luker: { getContext: () => context } }), context);
});
