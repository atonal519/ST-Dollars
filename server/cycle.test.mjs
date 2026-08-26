import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { createUniverse, insertCharacter, insertAccount, createRoom, addMembership, insertMessage } = require('./repo.js');
const { buildContext } = require('./context.js');

test('buildContext 组装房间角色(persona) + 最近消息', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-ctx-'));
  const db = openDb(dir); migrate(db);
  createUniverse(db, { universeId: 'u', stChatId: 'c' });
  insertCharacter(db, { characterId: 'ch1', universeId: 'u', sourceType: 'worldbook_entry', displayName: '伊泽尔', persona: JSON.stringify({ summary: '二皇子，佛口蛇心' }), aliases: '[]' });
  insertAccount(db, { accountId: 'a1', universeId: 'u', ownerCharacterId: 'ch1', accountKind: 'character', nickname: '匿名A' });
  createRoom(db, { roomId: 'r', universeId: 'u', type: 'public', name: '大厅' });
  addMembership(db, { id: 'm1', universeId: 'u', roomId: 'r', accountId: 'a1', state: 'joined' });
  insertMessage(db, { messageId: 'msg1', universeId: 'u', roomId: 'r', senderAccountId: 'a1', type: 'text', content: '大家好', status: 'committed' });

  const ctx = buildContext(db, { roomId: 'r' });
  assert.equal(ctx.accounts.length, 1);
  assert.equal(ctx.accounts[0].kind, 'character');
  assert.equal(ctx.accounts[0].persona, '二皇子，佛口蛇心');
  assert.equal(ctx.recent.length, 1);
  assert.equal(ctx.recent[0].nickname, '匿名A');
  assert.equal(ctx.recent[0].content, '大家好');
  db.close();
});
