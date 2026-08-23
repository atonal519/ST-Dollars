import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompatible, describeHealth } from './transport.logic.mjs';

test('相同协议版本 → 兼容', () => {
  assert.equal(isCompatible(1, 1), true);
});
test('不同协议版本 → 不兼容', () => {
  assert.equal(isCompatible(1, 2), false);
});
test('后端版本缺失 → 不兼容', () => {
  assert.equal(isCompatible(1, undefined), false);
});

test('后端正常且版本一致 → 全绿', () => {
  assert.match(describeHealth(1, { ok: true, protocolVersion: 1, db: 'ok' }), /连通.*版本 OK.*DB OK/s);
});
test('版本不一致 → 明确提示不兼容', () => {
  assert.match(describeHealth(1, { ok: true, protocolVersion: 2, db: 'ok' }), /版本不兼容/);
});
test('后端不可达 → 明确提示', () => {
  assert.match(describeHealth(1, null), /连不上后端/);
});
