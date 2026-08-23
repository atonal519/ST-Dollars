import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseMerge } = require('./merge.js');

test('解析合并结果', () => {
  const r = parseMerge('{"characters":[{"display_name":"伊泽尔·洛兰德","aliases":["伊泽尔","二皇子"],"summary":"x"}]}');
  assert.equal(r.length, 1);
  assert.equal(r[0].display_name, '伊泽尔·洛兰德');
  assert.deepEqual(r[0].aliases, ['伊泽尔', '二皇子']);
});
test('过滤无名', () => {
  assert.equal(parseMerge('{"characters":[{"display_name":""},{"display_name":"西里尔"}]}').length, 1);
});
