import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let formatStoryTime;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ formatStoryTime } = await server.ssrLoadModule('/src/ui/story-time.ts'));
});
test.after(async () => { await server?.close(); });

test('formats explicit ISO date-time text without timezone conversion', () => {
  assert.equal(formatStoryTime('2026-10-18T14:48:00.000Z'), '2026年10月18日 14:48 UTC');
  assert.equal(formatStoryTime('2026-10-18T14:48:00+08:00'), '2026年10月18日 14:48 UTC+08:00');
});

test('preserves narrative and invalid date-time strings verbatim', () => {
  assert.equal(formatStoryTime('次日清晨'), '次日清晨');
  assert.equal(formatStoryTime('2026-02-30T14:48:00Z'), '2026-02-30T14:48:00Z');
});
