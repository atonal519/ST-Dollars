const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dir) {
  return new DatabaseSync(path.join(dir, 'dollars.db'));
}
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT);`);
}
function metaGet(db, key) {
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key);
  return row ? row.value : undefined;
}
function metaSet(db, key, value) {
  db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
module.exports = { openDb, migrate, metaGet, metaSet };
