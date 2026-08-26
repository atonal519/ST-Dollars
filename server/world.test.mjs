import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { buildWorld } = require('./world.js');
const { countsByUniverse } = require('./repo.js');

test('建世界：角色→账号(带tier) + user账号 + 大厅 + 全员join', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-world-'));
  const db = openDb(dir); migrate(db);
  buildWorld(db, {
    universeId: 'u1', stChatId: 'chat-1',
    characters: [
      { display_name: '伊泽尔', aliases: ['二皇子'], summary: 's', tier: 'main' },
      { display_name: '奥古斯都', aliases: [], summary: 's', tier: 'npc' },
    ],
  });
  assert.deepEqual(countsByUniverse(db, 'u1'), { characters: 2, accounts: 3, rooms: 1 });
  const m = db.prepare('SELECT COUNT(*) n FROM room_membership WHERE universe_id=?').get('u1').n;
  assert.equal(m, 3);
  const tiers = db.prepare("SELECT tier FROM account WHERE account_kind='character' AND universe_id=?").all('u1').map(x => x.tier).sort();
  assert.deepEqual(tiers, ['main', 'npc']);
  // 匿名：角色账号昵称不等于真名
  const nicks = db.prepare("SELECT nickname FROM account WHERE account_kind='character' AND universe_id=?").all('u1').map(x => x.nickname);
  assert.ok(nicks.every(n => n !== '伊泽尔' && n !== '奥古斯都'));
  db.close();
});

test('空角色（模拟器卡）：只建 user + 大厅', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-world2-'));
  const db = openDb(dir); migrate(db);
  buildWorld(db, { universeId: 'u2', stChatId: 'chat-2', characters: [] });
  assert.deepEqual(countsByUniverse(db, 'u2'), { characters: 0, accounts: 1, rooms: 1 });
  db.close();
});
