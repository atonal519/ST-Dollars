import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { batchEntries, parseClassify, mergeClassified } = require('./classify.js');

test('分批', () => {
  assert.equal(batchEntries([1, 2, 3, 4, 5], 2).length, 3);
});
test('解析分类 JSON（含代码围栏）', () => {
  const out = parseClassify('```json\n{"items":[{"uid":"9","type":"character","candidate_name":"伊泽尔","confidence":0.9}]}\n```');
  assert.equal(out[0].type, 'character');
  assert.equal(out[0].candidate_name, '伊泽尔');
});
test('合并去重角色候选', () => {
  const merged = mergeClassified([
    [{ uid: '1', type: 'character', candidate_name: '伊泽尔' }, { uid: '2', type: 'setting' }],
    [{ uid: '1', type: 'character', candidate_name: '伊泽尔' }, { uid: '3', type: 'rule' }],
  ]);
  assert.equal(merged.characters.length, 1);
  assert.equal(merged.others, 2);
});
