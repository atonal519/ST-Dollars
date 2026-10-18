import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let extractJson;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ extractJson } = await server.ssrLoadModule('/src/simulation/json.ts')); });
test.after(async () => { await server?.close(); });

test('extracts wrapped and fenced model JSON while preserving commas inside strings', () => {
  const value = extractJson('模型说明：```json\n{"description":"逗号,右括号}，继续","items":["a",],}\n``` 完成');
  assert.deepEqual(value, { description: '逗号,右括号}，继续', items: ['a'] });
});
