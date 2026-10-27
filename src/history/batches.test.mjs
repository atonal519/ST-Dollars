import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let buildBatches; let subtractRanges;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ buildBatches, subtractRanges } = await server.ssrLoadModule('/src/history/batches.ts')); });
test.after(async () => { await server?.close(); });

test('subtracts previously covered floors and batches by 12000 characters without splitting surrogate pairs', () => {
  assert.deepEqual(subtractRanges(1, 12, [{ fromSeq: 3, toSeq: 5 }, { fromSeq: 9, toSeq: 9 }]), [{ fromSeq: 1, toSeq: 2 }, { fromSeq: 6, toSeq: 8 }, { fromSeq: 10, toSeq: 12 }]);
  const long = '🙂'.repeat(12001);
  const batches = buildBatches([{ seq: 1, isUser: false, text: long }]);
  assert.equal(batches.length, 2);
  assert.equal(batches.flat().map(item => item.text).join(''), long);
  assert.ok(batches.flat().every(batch => !/[\uD800-\uDBFF]$/.test(batch.text)));
  assert.ok(batches.every(batch => batch.reduce((sum, item) => sum + [...item.text].length, 0) <= 12000));
});

test('collects all 122 distinct floors across character-budget batches', () => {
  const turns = Array.from({ length: 122 }, (_, index) => ({ seq: index + 1, isUser: index % 2 === 1, text: `第${index + 1}楼` + '正文'.repeat(120) }));
  const batches = buildBatches(turns, 24000);
  const flattened = batches.flat();
  assert.equal(batches.length, 2);
  assert.deepEqual([...new Set(flattened.map(turn => turn.seq))], turns.map(turn => turn.seq));
  assert.deepEqual(flattened.map(turn => turn.text).join(''), turns.map(turn => turn.text).join(''));
});
