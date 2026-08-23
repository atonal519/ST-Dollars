import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { getSecondary, setSecondary, maskSecondary } = require('./config.js');

test('存取 Secondary 配置 + 打码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-cfg-'));
  const db = openDb(dir); migrate(db);
  assert.equal(getSecondary(db), null);
  setSecondary(db, { url: 'https://api.x.com/v1', model: 'gpt-4o-mini', key: 'sk-secret' });
  assert.equal(getSecondary(db).key, 'sk-secret');
  assert.deepEqual(maskSecondary(getSecondary(db)), { url: 'https://api.x.com/v1', model: 'gpt-4o-mini', hasKey: true });
  db.close();
});
