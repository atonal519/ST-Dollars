const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dir) {
  return new DatabaseSync(path.join(dir, 'dollars.db'));
}
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT);`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS universe (
      universe_id TEXT PRIMARY KEY, st_chat_id TEXT, schema_version INTEGER,
      enabled INTEGER DEFAULT 1, runtime_state TEXT DEFAULT 'active',
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS character (
      character_id TEXT PRIMARY KEY, universe_id TEXT, source_type TEXT, source_ref TEXT,
      display_name TEXT, persona TEXT, aliases TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS account (
      account_id TEXT PRIMARY KEY, universe_id TEXT, owner_character_id TEXT, owner_user_id TEXT,
      account_kind TEXT, nickname TEXT, avatar_color TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS room (
      room_id TEXT PRIMARY KEY, universe_id TEXT, type TEXT, name TEXT, lifecycle TEXT,
      created_by_account_id TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS room_membership (
      id TEXT PRIMARY KEY, universe_id TEXT, room_id TEXT, account_id TEXT, state TEXT, created_at INTEGER);
  `);
  try { db.exec(`ALTER TABLE account ADD COLUMN tier TEXT DEFAULT 'main';`); } catch { /* 列已存在 */ }
  db.exec(`CREATE TABLE IF NOT EXISTS message (
    message_id TEXT PRIMARY KEY, universe_id TEXT, room_id TEXT, sender_account_id TEXT,
    type TEXT, content TEXT, cycle_id TEXT, status TEXT, created_at INTEGER);`);
  const columns = db.prepare('PRAGMA table_info(message)').all();
  if (!columns.some(c => c.name === 'profile_snapshot')) db.exec('ALTER TABLE message ADD COLUMN profile_snapshot TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS message_room_status ON message(room_id, status, created_at);
    CREATE TABLE IF NOT EXISTS conversation_cycle (
      request_id TEXT PRIMARY KEY, universe_id TEXT NOT NULL, room_id TEXT NOT NULL,
      status TEXT NOT NULL, produced INTEGER DEFAULT 0, error_code TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
}
function metaGet(db, key) {
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key);
  return row ? row.value : undefined;
}
function metaSet(db, key, value) {
  db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
module.exports = { openDb, migrate, metaGet, metaSet };
