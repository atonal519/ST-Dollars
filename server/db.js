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
}
function metaGet(db, key) {
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key);
  return row ? row.value : undefined;
}
function metaSet(db, key, value) {
  db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
module.exports = { openDb, migrate, metaGet, metaSet };
