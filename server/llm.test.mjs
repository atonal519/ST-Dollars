import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractContent } = require('./llm.js');

test('正常响应提取 content', () => {
  assert.equal(extractContent({ choices: [{ message: { content: 'hi' } }] }), 'hi');
});
test('空 content 抛错', () => {
  assert.throws(() => extractContent({ choices: [{ message: { content: '' } }] }), /空/);
});
test('错误响应抛错', () => {
  assert.throws(() => extractContent({ error: { message: 'bad key' } }), /bad key/);
});
