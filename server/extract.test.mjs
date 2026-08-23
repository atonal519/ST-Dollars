import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseExtract } = require('./extract.js');

test('解析抽取 JSON', () => {
  const p = parseExtract('{"display_name":"伊泽尔","aliases":["二皇子"],"summary":"洛兰德帝国第二皇子"}');
  assert.equal(p.display_name, '伊泽尔');
  assert.deepEqual(p.aliases, ['二皇子']);
});
test('缺 display_name 抛错', () => {
  assert.throws(() => parseExtract('{"summary":"x"}'), /display_name/);
});
test('skip 响应', () => {
  assert.deepEqual(parseExtract('{"skip":true}'), { skip: true });
});
