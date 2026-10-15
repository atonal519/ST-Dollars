import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractJson } = require('./jsonutil.js');

test('纯 JSON', () => { assert.deepEqual(extractJson('{"a":1}'), { a: 1 }); });
test('代码围栏', () => { assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }); });
test('前后有解释文字', () => { assert.deepEqual(extractJson('好的，结果如下：\n{"a":1}\n以上。'), { a: 1 }); });
test('直接数组', () => { assert.deepEqual(extractJson('[1,2,3]'), [1, 2, 3]); });
test('对象和数组尾逗号可解析且字符串内容保持原样', () => {
  const expected = { items: ['逗号, 括号 ] } 引号 " 和反斜杠 \\'] };
  const source = JSON.stringify(expected).replace(']}', ',],}');
  assert.deepEqual(extractJson(source), expected);
});
test('跳过前面的非 JSON 括号片段继续寻找有效 JSON', () => {
  assert.deepEqual(extractJson('说明 {not JSON} 然后是： {"ok":true,}'), { ok: true });
});
