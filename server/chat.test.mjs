import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { migrate } = require('./db.js');
const { buildWorld } = require('./world.js');
const { createRoom, insertMessage } = require('./repo.js');
const { buildContext } = require('./context.js');
const { setSecondary } = require('./config.js');
const { createChatService } = require('./chat.js');

function fixture(t, generate = async () => ({ produced: 0 })) {
  const db = new DatabaseSync(':memory:'); migrate(db);
  t.after(() => db.close());
  buildWorld(db, { universeId: 'u1', stChatId: 'chat1', characters: [{ display_name: '秘密真名', summary: '秘密人设', tier: 'npc' }] });
  buildWorld(db, { universeId: 'u2', stChatId: 'chat2', characters: [] });
  setSecondary(db, { url: 'https://example.invalid/v1', model: 'mock', key: 'test-only' });
  const chat = createChatService({ db, generate });
  const world = chat.universeForChat('chat1');
  const input = { stChatId: 'chat1', universeId: 'u1', roomId: world.rooms[0].room_id };
  return { db, chat, input, user: world.userAccount };
}
const send = (f, messageId = 'msg_pending', content = '你好') => f.chat.sendPending({ ...f.input, messageId, content });
const cycle = (f, requestId = 'cyc_test', pendingMessageIds = ['msg_pending']) => f.chat.continueCycle({ ...f.input, requestId, pendingMessageIds });

test('房间只返回匿名资料，隐藏未加入房间与跨 Universe 请求', t => {
  const f = fixture(t);
  createRoom(f.db, { roomId: 'hidden', universeId: 'u1', type: 'private', name: '秘密房间' });
  const snapshot = f.chat.roomSnapshot(f.input);
  const text = JSON.stringify(snapshot);
  for (const secret of ['秘密真名','秘密人设','owner_character_id','persona','tier']) assert.ok(!text.includes(secret));
  assert.equal(f.chat.universeForChat('chat1').rooms.length, 1);
  assert.throws(() => f.chat.roomSnapshot({ ...f.input, universeId: 'u2' }), e => e.code === 'wrong_universe');
  assert.throws(() => f.chat.roomSnapshot({ ...f.input, roomId: 'hidden' }), e => e.code === 'room_forbidden');
});
test('pending 保存且不进角色上下文；可编辑、删除；idempotency 防重复发送', t => {
  const f = fixture(t);
  send(f); send(f);
  assert.equal(f.chat.roomSnapshot(f.input).pending.length, 1);
  assert.equal(buildContext(f.db, { roomId: f.input.roomId }).recent.length, 0);
  f.chat.editPending({ ...f.input, messageId: 'msg_pending', content: '修改后的话' });
  assert.equal(f.chat.roomSnapshot(f.input).pending[0].content, '修改后的话');
  assert.throws(() => send(f), e => e.code === 'message_conflict');
  f.chat.removePending({ ...f.input, messageId: 'msg_pending' });
  assert.equal(f.chat.roomSnapshot(f.input).pending.length, 0);
});

test('pending 上限由后端执行，达到上限后仍允许幂等重试', t => {
  const f = fixture(t);
  for (let i=0; i<100; i++) send(f, 'pending_' + i);
  send(f, 'pending_0');
  assert.throws(() => send(f, 'one_too_many'), e => e.code === 'pending_full');
  assert.equal(f.chat.roomSnapshot(f.input).pending.length, 100);
});
test('继续原子提交选中 pending，并从数据库识别真实用户账号', async t => {
  let context;
  const f = fixture(t, async ({ db, roomId }) => { context = buildContext(db, { roomId }); return { produced: 0 }; });
  send(f); send(f, 'msg_later', '后发的消息');
  const output = await cycle(f);
  assert.equal(output.status, 'cycle_completed_empty');
  assert.deepEqual(output.messages.map(m => m.message_id), ['msg_pending']);
  assert.equal(context.recent[0].sender_account_id, f.user.account_id);
  assert.equal(context.recent[0].nickname, '我');
  assert.equal(f.chat.roomSnapshot(f.input).pending[0].message_id, 'msg_later');
  for (const method of ['editPending','removePending']) assert.throws(() => f.chat[method]({ ...f.input, messageId: 'msg_pending', content: '不能改' }), e => e.code === 'already_committed');
});
test('没有 pending 也可继续；空轮不会错误返回整房间历史', async t => {
  const f = fixture(t);
  insertMessage(f.db, { messageId: 'old', universeId: 'u1', roomId: f.input.roomId, senderAccountId: f.user.account_id, content: '旧消息' });
  const output = await cycle(f, 'cyc_empty', []);
  assert.equal(output.status, 'cycle_completed_empty');
  assert.deepEqual(output.messages, []);
});
test('队列有无效 ID 时全批不提交、不创建 cycle', async t => {
  const f = fixture(t); send(f);
  await assert.rejects(cycle(f, 'invalid', ['msg_pending','not-existing']), e => e.code === 'missing_message');
  assert.equal(f.chat.roomSnapshot(f.input).pending.length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM conversation_cycle').get().n, 0);
});
test('重复 Continue 返回原轮；模型只运行一次、用户消息不重复', async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return { produced: 0 }; }); send(f);
  await cycle(f);
  const again = await cycle(f);
  assert.equal(calls, 1); assert.equal(again.replayed, true);
  assert.equal(f.chat.roomSnapshot(f.input).messages.length, 1);
});
test('生成失败保留已提交用户及 AI 消息；重试同一请求不会重新生成', async t => {
  let calls = 0;
  const f = fixture(t, async ({ db, universeId, roomId, cycleId }) => {
    calls++;
    const actor = db.prepare("SELECT account_id FROM account WHERE universe_id=? AND account_kind='character'").get(universeId);
    insertMessage(db, { messageId: 'ai_saved', universeId, roomId, senderAccountId: actor.account_id, cycleId, content: '已发生的回应' });
    throw new Error('模拟模型失败');
  }); send(f);
  const output = await cycle(f);
  assert.equal(output.ok, false); assert.equal(output.status, 'generation_failed'); assert.equal(output.produced, 1);
  assert.equal(f.chat.roomSnapshot(f.input).messages.length, 2);
  assert.equal(f.chat.roomSnapshot(f.input).pending.length, 0);
  assert.equal((await cycle(f)).replayed, true); assert.equal(calls, 1);
});
test('同 Universe 生成串行，另一个 Universe 可以生成，结束后锁释放', async t => {
  let release;
  const f = fixture(t, () => new Promise(resolve => { release = resolve; })); send(f);
  const first = cycle(f);
  assert.ok(f.chat.roomSnapshot(f.input).activeCycle);
  await assert.rejects(cycle(f, 'cyc_second', []), e => e.code === 'cycle_running');
  assert.throws(() => send(f, 'blocked'), e => e.code === 'cycle_running');
  const secondWorld = f.chat.universeForChat('chat2');
  const otherRelease = release;
  const other = f.chat.continueCycle({ stChatId: 'chat2', universeId: 'u2', roomId: secondWorld.rooms[0].room_id, requestId: 'cyc_other', pendingMessageIds: [] });
  release({ produced: 0 }); await other;
  otherRelease({ produced: 0 }); await first;
  assert.equal(f.chat.roomSnapshot(f.input).activeCycle, null);
  send(f, 'after');
});
test('历史分页按稳定插入顺序，不丢旧消息；新消息保存当时昵称颜色', t => {
  const f = fixture(t);
  for (let i=0; i<205; i++) insertMessage(f.db, { messageId: 'history_' + i, universeId: 'u1', roomId: f.input.roomId, senderAccountId: f.user.account_id, content: String(i) });
  f.db.prepare('UPDATE account SET nickname=?, avatar_color=? WHERE account_id=?').run('新昵称', '#ffffff', f.user.account_id);
  const latest = f.chat.roomSnapshot(f.input);
  assert.equal(latest.messages.length, 100); assert.equal(latest.hasMore, true);
  assert.equal(latest.messages[0].content, '105'); assert.equal(latest.messages[0].profile.nickname, '我');
  const older = f.chat.roomSnapshot({ ...f.input, before: latest.messages[0].message_id });
  const oldest = f.chat.roomSnapshot({ ...f.input, before: older.messages[0].message_id });
  assert.deepEqual(oldest.messages.map(m => m.content), ['0','1','2','3','4']); assert.equal(oldest.hasMore, false);
});
test('服务重启将运行中的 cycle 标为 interrupted，不自动重跑', async t => {
  const f = fixture(t);
  f.db.prepare("INSERT INTO conversation_cycle(request_id,universe_id,room_id,status,created_at,updated_at) VALUES (?,?,?,'running',1,1)")
    .run('interrupted', 'u1', f.input.roomId);
  let calls = 0;
  const restarted = createChatService({ db: f.db, generate: () => { calls++; } });
  const output = await restarted.continueCycle({ ...f.input, requestId: 'interrupted', pendingMessageIds: [] });
  assert.equal(output.code, 'interrupted'); assert.equal(output.replayed, true); assert.equal(calls, 0);
});
