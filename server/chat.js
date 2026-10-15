const { getUniverseByChat, insertMessage, countsByUniverse } = require('./repo.js');
const { getSecondary, getPrimary } = require('./config.js');
const { runCycle } = require('./cycle.js');

class ChatError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, text, status) => { throw new ChatError(code, text, status); };
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const accountView = a => ({ account_id: a.account_id, nickname: a.nickname || '匿名', avatar_color: a.avatar_color || '#a3a5b0' });
const roomView = r => ({ room_id: r.room_id, name: r.name, type: r.type, lifecycle: r.lifecycle });

// 只投影可见资料，不返回 character/persona/tier 或真实所有者映射。
function messageView(db, m) {
  let profile;
  try { profile = JSON.parse(m.profile_snapshot); } catch { /* 旧消息回退 */ }
  if (!profile) {
    const account = db.prepare('SELECT * FROM account WHERE account_id=? AND universe_id=?').get(m.sender_account_id, m.universe_id);
    profile = account ? accountView(account) : { nickname: '匿名', avatar_color: '#a3a5b0' };
  }
  return { message_id: m.message_id, sender_account_id: m.sender_account_id, type: m.type,
    content: m.content, status: m.status, cycle_id: m.cycle_id, created_at: m.created_at,
    profile: { nickname: profile.nickname, avatar_color: profile.avatar_color } };
}

function createChatService({ db, generate = runCycle }) {
  const active = new Map();
  // 只在进程启动时恢复；health/migrate 不得把仍在运行的轮次标为中断。
  db.prepare("UPDATE conversation_cycle SET status='generation_failed', error_code='interrupted', updated_at=? WHERE status='running'").run(Date.now());

  function scope(input, requireRoom = true) {
    if (!validId(input.stChatId) || !validId(input.universeId)) fail('invalid_scope', '缺少当前聊天或世界标识。');
    const universe = getUniverseByChat(db, input.stChatId);
    if (!universe || universe.universe_id !== input.universeId) fail('wrong_universe', '当前聊天与世界不匹配，请重新打开面板。', 403);
    const user = db.prepare("SELECT * FROM account WHERE universe_id=? AND account_kind='user' AND owner_user_id='user'").get(input.universeId);
    if (!user) fail('missing_user', '当前世界缺少用户账号。', 409);
    if (!requireRoom) return { universe, user };
    if (!validId(input.roomId)) fail('invalid_room', '缺少房间标识。');
    const room = db.prepare(`SELECT r.* FROM room r JOIN room_membership m ON m.room_id=r.room_id AND m.universe_id=r.universe_id
      WHERE r.room_id=? AND r.universe_id=? AND m.account_id=? AND m.state='joined'`).get(input.roomId, input.universeId, user.account_id);
    if (!room) fail('room_forbidden', '你尚未加入这个房间。', 403);
    return { universe, user, room };
  }
  function writable(input) {
    const value = scope(input);
    if (active.has(input.universeId)) fail('cycle_running', '当前世界仍在回应，请稍候。', 409);
    return value;
  }
  function text(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 8000) fail('invalid_content', '请输入 1–8000 字的消息。');
    return value.trim();
  }
  function findMessage(input, user) {
    if (!validId(input.messageId)) fail('invalid_message', '缺少消息标识。');
    const row = db.prepare('SELECT * FROM message WHERE message_id=? AND universe_id=? AND room_id=? AND sender_account_id=?')
      .get(input.messageId, input.universeId, input.roomId, user.account_id);
    if (!row) fail('missing_message', '消息已变化，请刷新房间。', 404);
    return row;
  }
  function universeForChat(stChatId) {
    if (!validId(stChatId)) fail('invalid_chat', '请先打开一个 SillyTavern 聊天。');
    const universe = getUniverseByChat(db, stChatId);
    if (!universe) return { ok: true, universe: null, counts: null, rooms: [], userAccount: null };
    const { user } = scope({ stChatId, universeId: universe.universe_id }, false);
    const rooms = db.prepare(`SELECT DISTINCT r.* FROM room r JOIN room_membership m ON m.room_id=r.room_id AND m.universe_id=r.universe_id
      WHERE r.universe_id=? AND m.account_id=? AND m.state='joined' ORDER BY r.created_at, r.rowid`).all(universe.universe_id, user.account_id);
    return { ok: true, universe: { universe_id: universe.universe_id, st_chat_id: universe.st_chat_id },
      counts: countsByUniverse(db, universe.universe_id), rooms: rooms.map(roomView), userAccount: accountView(user) };
  }
  function roomSnapshot(input) {
    const { room, user } = scope(input);
    let before = Number.MAX_SAFE_INTEGER;
    if (input.before) {
      const cursor = db.prepare('SELECT rowid FROM message WHERE message_id=? AND universe_id=? AND room_id=?').get(input.before, input.universeId, input.roomId);
      if (!cursor) fail('invalid_cursor', '历史消息起点已变化，请刷新。');
      before = cursor.rowid;
    }
    const rows = db.prepare(`SELECT * FROM message WHERE universe_id=? AND room_id=? AND rowid<?
      AND status IN ('committed','pending_sync') ORDER BY rowid DESC LIMIT 101`).all(input.universeId, input.roomId, before);
    const hasMore = rows.length > 100;
    const messages = rows.slice(0, 100).reverse().map(m => messageView(db, m));
    const pending = db.prepare("SELECT * FROM message WHERE universe_id=? AND room_id=? AND sender_account_id=? AND status='pending_trigger' ORDER BY rowid")
      .all(input.universeId, input.roomId, user.account_id).map(m => messageView(db, m));
    const members = db.prepare(`SELECT DISTINCT a.* FROM room_membership m JOIN account a ON a.account_id=m.account_id AND a.universe_id=m.universe_id
      WHERE m.universe_id=? AND m.room_id=? AND m.state='joined' ORDER BY a.created_at, a.rowid`).all(input.universeId, input.roomId).map(accountView);
    return { ok: true, room: roomView(room), userAccount: accountView(user), members, messages, pending, hasMore,
      activeCycle: active.get(input.universeId) || null };
  }
  function sendPending(input) {
    const { user } = writable(input);
    const content = text(input.content);
    if (!validId(input.messageId)) fail('invalid_message', '缺少消息标识。');
    const existing = db.prepare('SELECT * FROM message WHERE message_id=?').get(input.messageId);
    if (existing) {
      if (existing.universe_id !== input.universeId || existing.room_id !== input.roomId || existing.sender_account_id !== user.account_id || existing.content !== content)
        fail('message_conflict', '这个消息标识已有其他内容，请刷新。', 409);
      return { ok: true, message: messageView(db, existing) };
    }
    const count = db.prepare("SELECT COUNT(*) n FROM message WHERE universe_id=? AND room_id=? AND sender_account_id=? AND status='pending_trigger'")
      .get(input.universeId, input.roomId, user.account_id).n;
    if (count >= 100) fail('pending_full', '最多保存 100 条待回应消息，请先点击继续。', 409);
    insertMessage(db, { messageId: input.messageId, universeId: input.universeId, roomId: input.roomId,
      senderAccountId: user.account_id, content, status: 'pending_trigger' });
    return { ok: true, message: messageView(db, findMessage(input, user)) };
  }
  function editPending(input) {
    const { user } = writable(input);
    const row = findMessage(input, user);
    if (row.status !== 'pending_trigger') fail('already_committed', '消息已经提交，不能再修改。', 409);
    db.prepare("UPDATE message SET content=? WHERE message_id=? AND status='pending_trigger'").run(text(input.content), input.messageId);
    return { ok: true, message: messageView(db, findMessage(input, user)) };
  }
  function removePending(input) {
    const { user } = writable(input);
    const row = findMessage(input, user);
    if (row.status !== 'pending_trigger') fail('already_committed', '消息已经提交，不能再删除。', 409);
    db.prepare("DELETE FROM message WHERE message_id=? AND status='pending_trigger'").run(input.messageId);
    return { ok: true };
  }
  function result(row, replayed = false) {
    const messages = db.prepare('SELECT * FROM message WHERE cycle_id=? AND universe_id=? AND room_id=? ORDER BY rowid')
      .all(row.request_id, row.universe_id, row.room_id).map(m => messageView(db, m));
    return { ok: row.status !== 'generation_failed', accepted: true, requestId: row.request_id,
      status: row.status, produced: row.produced, code: row.error_code || undefined, replayed, messages,
      error: row.status === 'generation_failed' ? '本轮回应中断，已提交的消息已保留。可刷新查看，再点击继续。' : undefined };
  }
  async function continueCycle(input) {
    const { user } = scope(input);
    if (!validId(input.requestId)) fail('invalid_request', '缺少本轮请求标识。');
    const previous = db.prepare('SELECT * FROM conversation_cycle WHERE request_id=?').get(input.requestId);
    if (previous) {
      if (previous.universe_id !== input.universeId || previous.room_id !== input.roomId) fail('request_conflict', '本轮请求属于其他房间。', 409);
      if (previous.status === 'running') fail('cycle_running', '本轮仍在回应，请稍候。', 409);
      return result(previous, true);
    }
    writable(input);
    const secondary = getSecondary(db);
    const primary = getPrimary(db) || secondary;
    if (!secondary?.url || !secondary?.model || !secondary?.key || !primary?.url || !primary?.model || !primary?.key)
      fail('api_not_configured', '请先在设置中配置模型。待回应消息仍保留。');
    const ids = input.pendingMessageIds || [];
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every(validId) || new Set(ids).size !== ids.length)
      fail('invalid_pending', '待回应消息队列不合法。');
    const pending = ids.map(messageId => findMessage({ ...input, messageId }, user));
    if (pending.some(m => m.status !== 'pending_trigger')) fail('pending_changed', '待回应消息已被提交，请刷新后继续。', 409);
    const timestamp = Date.now();
    db.exec('BEGIN');
    try {
      db.prepare("INSERT INTO conversation_cycle(request_id,universe_id,room_id,status,created_at,updated_at) VALUES (?,?,?,'running',?,?)")
        .run(input.requestId, input.universeId, input.roomId, timestamp, timestamp);
      const commit = db.prepare("UPDATE message SET status='committed', cycle_id=? WHERE message_id=? AND status='pending_trigger'");
      for (const m of pending) commit.run(input.requestId, m.message_id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    active.set(input.universeId, { roomId: input.roomId, requestId: input.requestId });
    try {
      const output = await generate({ db, cfgPrimary: primary, cfgSecondary: secondary, universeId: input.universeId,
        roomId: input.roomId, cycleId: input.requestId });
      db.prepare('UPDATE conversation_cycle SET status=?, produced=?, updated_at=? WHERE request_id=?')
        .run(output.produced ? 'cycle_completed' : 'cycle_completed_empty', output.produced, Date.now(), input.requestId);
    } catch {
      const produced = db.prepare("SELECT COUNT(*) n FROM message WHERE cycle_id=? AND sender_account_id<>?").get(input.requestId, user.account_id).n;
      db.prepare("UPDATE conversation_cycle SET status='generation_failed', produced=?, error_code='generation_failed', updated_at=? WHERE request_id=?")
        .run(produced, Date.now(), input.requestId);
    } finally { active.delete(input.universeId); }
    return result(db.prepare('SELECT * FROM conversation_cycle WHERE request_id=?').get(input.requestId));
  }
  return { universeForChat, roomSnapshot, sendPending, editPending, removePending, continueCycle };
}
module.exports = { createChatService, ChatError };
