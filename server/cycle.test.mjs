import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { createUniverse, insertCharacter, insertAccount, createRoom, addMembership, insertMessage } = require('./repo.js');
const { buildContext } = require('./context.js');
const { runCycle } = require('./cycle.js');

function scriptedCycle(t, outputs, options = {}) {
  const db = new DatabaseSync(':memory:'); migrate(db);
  createUniverse(db, { universeId: 'u', stChatId: 'c' });
  insertCharacter(db, { characterId: 'ch', universeId: 'u', sourceType: 'worldbook_entry', displayName: '隐藏真名', persona: '{}' });
  insertAccount(db, { accountId: 'acc_actor', universeId: 'u', ownerCharacterId: 'ch', accountKind: 'character', nickname: '路人' });
  createRoom(db, { roomId: 'r', universeId: 'u', type: 'public', name: '大厅' });
  addMembership(db, { id: 'm', universeId: 'u', roomId: 'r', accountId: 'acc_actor', state: 'joined' });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    assert.ok(outputs.length, '不得有额外模型请求');
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => ({ choices: [{ message: { content: typeof next === 'string' ? next : JSON.stringify(next) } }] }) };
  };
  t.after(() => { globalThis.fetch = previous; db.close(); });
  const cfg = { url: 'https://example.invalid/v1', key: 'mock', model: 'mock' };
  return runCycle({ db, cfgPrimary: cfg, cfgSecondary: cfg, universeId: 'u', roomId: 'r', cycleId: 'test_cycle', ...options,
    onMessage: message => options.onMessage?.(message, db) });
}

test('调度器明确选择 null 才是合法沉默', async t => {
  const out = await scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'observe' }, { actor_id: null }]);
  assert.equal(out.produced, 0); assert.equal(out.status, 'completed_empty');
});
test('顶层 JSON null 选人结果表示合法空轮', async t => {
  const out = await scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'observe' }, null]);
  assert.equal(out.produced, 0);
  assert.equal(out.status, 'completed_empty');
});
test('调度器缺失 actor 或选择未知账号不能冒充自然沉默', async t => {
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'speak' }, {}]), /选择格式/);
});
test('角色意图调用失败不能吞掉为沉默', async t => {
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, new Error('mock timeout')]), /mock timeout/);
});
test('speak 后台词缺失不能被记为成功空轮', async t => {
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'speak' }, { actor_id: 'acc_actor' }, {}]), /发言输出格式/);
});
test('各阶段常见字段别名和表面格式差异仍完成一轮并落库原台词', async t => {
  const messages = [];
  let stored;
  const out = await scriptedCycle(t, [
    [{ accountId: 'acc_actor' }, 'acc_actor', { account_id: 'missing' }],
    { intent: ' SPEAK ', topic: '问候' },
    { account_id: 'acc_actor' },
    { content: '  你好，大家！  ' },
    JSON.stringify(' STOP '),
  ], { onMessage: (message, db) => {
    messages.push(message);
    stored = db.prepare('SELECT sender_account_id, content FROM message WHERE cycle_id = ?').get('test_cycle');
  } });
  assert.equal(out.produced, 1);
  assert.equal(out.status, 'completed');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, '你好，大家！');
  assert.equal(stored.sender_account_id, 'acc_actor');
  assert.equal(stored.content, '你好，大家！');
});
test('台词 text 别名和直接 JSON 字符串都可接收', async t => {
  for (const output of [{ text: '由 text 字段发言' }, JSON.stringify('直接字符串发言')]) {
    const messages = [];
    const out = await scriptedCycle(t, [
      { candidates: [{ account_id: 'acc_actor' }] },
      { action: 'speak' },
      { actorId: 'acc_actor' },
      output,
      { decision: ' STOP ' },
    ], { onMessage: message => messages.push(message) });
    assert.equal(out.produced, 1);
    assert.equal(messages[0].content, typeof output === 'string' ? '直接字符串发言' : '由 text 字段发言');
  }
});
test('台词字段为空时回退到后续非空字符串', async t => {
  for (const output of [
    { message: '', content: '你好' },
    { message: null, text: '你好' },
  ]) {
    const messages = [];
    const out = await scriptedCycle(t, [
      { candidates: [{ account_id: 'acc_actor' }] },
      { action: 'speak' },
      { actor_id: 'acc_actor' },
      output,
      { decision: 'stop' },
    ], { onMessage: message => messages.push(message) });
    assert.equal(out.produced, 1);
    assert.equal(messages[0].content, '你好');
  }
});
test('未知动作和缺少选人字段仍明确失败', async t => {
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: ' maybe ' }]), /意图格式/);
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'speak' }, {}]), /选择格式/);
});
test('未知账号和非 speak 角色被选中时明确失败', async t => {
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'speak' }, { actorId: 'not_in_room' }]), /未知角色/);
  await assert.rejects(scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'observe' }, { actorId: 'acc_actor' }]), /不能发言/);
});
test('显式字符串 null（忽略大小写和空白）表示无人', async t => {
  const out = await scriptedCycle(t, [{ candidates: [{ account_id: 'acc_actor' }] }, { action: 'observe' }, { actorId: ' Null ' }]);
  assert.equal(out.produced, 0);
  assert.equal(out.status, 'completed_empty');
});

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
