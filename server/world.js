const crypto = require('node:crypto');
const { createUniverse, insertCharacter, createRoom, addMembership } = require('./repo.js');

const ADJ = ['沉默', '夜行', '匿名', '路人', '深蓝', '孤影', '微光', '无名', '游丝', '暗涌'];
const placeholderNick = () => ADJ[crypto.randomInt(ADJ.length)] + '_' + crypto.randomUUID().slice(0, 4);
const randColor = () => `hsl(${crypto.randomInt(360)} 60% 55%)`;
const id = (p) => p + '_' + crypto.randomUUID().slice(0, 8);

// repo.insertAccount 不含 tier 列，这里单独写带 tier 的插入
function insertAccountWithTier(db, a) {
  db.prepare(`INSERT INTO account (account_id,universe_id,owner_character_id,owner_user_id,account_kind,nickname,avatar_color,tier,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(a.accountId, a.universeId, a.ownerCharacterId ?? null, a.ownerUserId ?? null, a.accountKind, a.nickname ?? null, a.avatarColor ?? null, a.tier ?? 'main', Date.now());
}

// 事务建世界：Universe + user 账号 + 大厅 + 每个角色(Character+Account带tier) + 全员 join。
function buildWorld(db, { universeId, stChatId, characters }) {
  db.exec('BEGIN');
  try {
    createUniverse(db, { universeId, stChatId });
    const roomId = id('room');
    const userAcc = id('acc');
    insertAccountWithTier(db, { accountId: userAcc, universeId, ownerUserId: 'user', accountKind: 'user', nickname: '我', avatarColor: '#e5e7eb', tier: 'main' });
    createRoom(db, { roomId, universeId, type: 'public', name: '大厅', createdByAccountId: userAcc });
    addMembership(db, { id: id('mem'), universeId, roomId, accountId: userAcc, state: 'joined' });
    for (const c of characters || []) {
      const charId = id('char');
      const accId = id('acc');
      insertCharacter(db, { characterId: charId, universeId, sourceType: 'worldbook_entry', sourceRef: null, displayName: c.display_name, persona: JSON.stringify({ summary: c.summary || '' }), aliases: JSON.stringify(c.aliases || []) });
      insertAccountWithTier(db, { accountId: accId, universeId, ownerCharacterId: charId, accountKind: 'character', nickname: placeholderNick(), avatarColor: randColor(), tier: c.tier || 'main' });
      addMembership(db, { id: id('mem'), universeId, roomId, accountId: accId, state: 'joined' });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { counts: { characters: (characters || []).length, accounts: (characters || []).length + 1, rooms: 1 } };
}
module.exports = { buildWorld };
