import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { createUniverse, getUniverseByChat, insertCharacter, insertAccount, createRoom, addMembership, countsByUniverse } = require('./repo.js');

test('建 universe/角色/账号/房间/成员 并统计', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-repo-'));
  const db = openDb(dir); migrate(db);
  const u = 'u1';
  createUniverse(db, { universeId: u, stChatId: 'chat-1' });
  assert.equal(getUniverseByChat(db, 'chat-1').universe_id, u);
  insertCharacter(db, { characterId: 'c1', universeId: u, sourceType: 'worldbook_entry', sourceRef: 'uid-9', displayName: '伊泽尔', persona: '{}', aliases: '["二皇子"]' });
  insertAccount(db, { accountId: 'a1', universeId: u, ownerCharacterId: 'c1', accountKind: 'character', nickname: '匿名_x1', avatarColor: '#abc' });
  insertAccount(db, { accountId: 'au', universeId: u, ownerUserId: 'user', accountKind: 'user', nickname: '我', avatarColor: '#ddd' });
  createRoom(db, { roomId: 'r1', universeId: u, type: 'public', name: '大厅', createdByAccountId: 'au' });
  addMembership(db, { id: 'm1', universeId: u, roomId: 'r1', accountId: 'a1', state: 'joined' });
  addMembership(db, { id: 'm2', universeId: u, roomId: 'r1', accountId: 'au', state: 'joined' });
  assert.deepEqual(countsByUniverse(db, u), { characters: 1, accounts: 2, rooms: 1 });
  db.close();
});
