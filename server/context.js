const { recentMessages, roomAccounts, characterById } = require('./repo.js');

// 取角色账号的 persona 摘要（M1 建世界时 persona 存 JSON {summary}）
function personaOf(db, acc) {
  if (acc.account_kind !== 'character' || !acc.owner_character_id) return '';
  const ch = characterById(db, acc.owner_character_id);
  try { return JSON.parse(ch?.persona || '{}').summary || ''; } catch { return ''; }
}

// M2-A 简化版上下文：房间在室账号(含 tier 透传) + 最近消息。
// 【预留接口】未来 Context Pack 完整版（权限隔离/Knowledge/Identity/预算）整体替换此函数，cycle 调用不变。
function buildContext(db, { roomId, limit = 20 }) {
  const accounts = roomAccounts(db, roomId).map(a => ({
    account_id: a.account_id, nickname: a.nickname, tier: a.tier, kind: a.account_kind, persona: personaOf(db, a),
  }));
  const recent = recentMessages(db, roomId, limit).map(m => {
    const acc = accounts.find(x => x.account_id === m.sender_account_id);
    return { sender_account_id: m.sender_account_id, nickname: acc?.nickname || m.sender_account_id, content: m.content };
  });
  return { accounts, recent };
}
module.exports = { buildContext };
