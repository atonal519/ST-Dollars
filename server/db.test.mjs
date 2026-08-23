import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate, metaGet, metaSet } = require('./db.js');

test('建库 + 迁移幂等 + _meta 读写', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-'));
  const db = openDb(dir);
  migrate(db); migrate(db);                 // 跑两次验证幂等
  assert.equal(metaGet(db, 'x'), undefined);
  metaSet(db, 'x', 'hello');
  assert.equal(metaGet(db, 'x'), 'hello');
  metaSet(db, 'x', 'world');                // 覆盖
  assert.equal(metaGet(db, 'x'), 'world');
  db.close();
});
