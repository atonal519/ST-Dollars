import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let displaySourceLabel;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ displaySourceLabel } = await server.ssrLoadModule('/src/ui/source-label.ts'));
});
test.after(async () => { await server?.close(); });

test('only recognized Dollars chat source IDs display zero-based floor numbers', () => {
  assert.equal(displaySourceLabel({ kind: 'chat', id: 'history-floor:131', label: '第 131 楼正文' }, 'scope'), '第 130 楼正文');
  assert.equal(displaySourceLabel({ kind: 'chat', id: 'scope:1', label: '第 1 楼正文' }, 'scope'), '第 0 楼正文');
  assert.equal(displaySourceLabel({ kind: 'chat', id: 'other-scope:131', label: '第 131 楼正文' }, 'scope'), '第 131 楼正文');
  assert.equal(displaySourceLabel({ kind: 'chat', id: 'scope:nested:4', label: '外部来源第 4 楼' }, 'scope'), '外部来源第 4 楼');
  assert.equal(displaySourceLabel({ kind: 'manual', id: 'history-floor:131', label: '手动来源第 131 楼' }, 'scope'), '手动来源第 131 楼');
});

test('simulation origin displays its relative story interval without pretending to be a floor',()=>{assert.equal(displaySourceLabel({kind:'simulation',id:'history-floor:131',label:'稍早 → 随后'},'scope'),'稍早 → 随后');});
