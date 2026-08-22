import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompatible } from './transport.logic.mjs';

test('相同协议版本 → 兼容', () => {
  assert.equal(isCompatible(1, 1), true);
});
test('不同协议版本 → 不兼容', () => {
  assert.equal(isCompatible(1, 2), false);
});
test('后端版本缺失 → 不兼容', () => {
  assert.equal(isCompatible(1, undefined), false);
});
