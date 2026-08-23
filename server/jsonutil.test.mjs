import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractJson } = require('./jsonutil.js');

test('纯 JSON', () => { assert.deepEqual(extractJson('{"a":1}'), { a: 1 }); });
test('代码围栏', () => { assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }); });
test('前后有解释文字', () => { assert.deepEqual(extractJson('好的，结果如下：\n{"a":1}\n以上。'), { a: 1 }); });
test('直接数组', () => { assert.deepEqual(extractJson('[1,2,3]'), [1, 2, 3]); });
