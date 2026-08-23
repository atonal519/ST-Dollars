const now = () => Date.now();

function createUniverse(db, { universeId, stChatId, schemaVersion = 1 }) {
  db.prepare(`INSERT INTO universe (universe_id,st_chat_id,schema_version,enabled,runtime_state,created_at,updated_at)
    VALUES (?,?,?,1,'active',?,?)`).run(universeId, stChatId, schemaVersion, now(), now());
}
function getUniverseByChat(db, stChatId) {
  return db.prepare('SELECT * FROM universe WHERE st_chat_id = ?').get(stChatId);
}
function insertCharacter(db, c) {
  db.prepare(`INSERT INTO character (character_id,universe_id,source_type,source_ref,display_name,persona,aliases,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(c.characterId, c.universeId, c.sourceType, c.sourceRef ?? null, c.displayName ?? null, c.persona ?? null, c.aliases ?? null, now());
}
function insertAccount(db, a) {
  db.prepare(`INSERT INTO account (account_id,universe_id,owner_character_id,owner_user_id,account_kind,nickname,avatar_color,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(a.accountId, a.universeId, a.ownerCharacterId ?? null, a.ownerUserId ?? null, a.accountKind, a.nickname ?? null, a.avatarColor ?? null, now());
}
function createRoom(db, r) {
  db.prepare(`INSERT INTO room (room_id,universe_id,type,name,lifecycle,created_by_account_id,created_at)
    VALUES (?,?,?,?, 'active', ?,?)`).run(r.roomId, r.universeId, r.type, r.name, r.createdByAccountId ?? null, now());
}
function addMembership(db, m) {
  db.prepare(`INSERT INTO room_membership (id,universe_id,room_id,account_id,state,created_at)
    VALUES (?,?,?,?,?,?)`).run(m.id, m.universeId, m.roomId, m.accountId, m.state ?? 'joined', now());
}
function countsByUniverse(db, u) {
  const one = (sql) => db.prepare(sql).get(u).n;
  return {
    characters: one('SELECT COUNT(*) n FROM character WHERE universe_id = ?'),
    accounts: one('SELECT COUNT(*) n FROM account WHERE universe_id = ?'),
    rooms: one('SELECT COUNT(*) n FROM room WHERE universe_id = ?'),
  };
}
module.exports = { createUniverse, getUniverseByChat, insertCharacter, insertAccount, createRoom, addMembership, countsByUniverse };
