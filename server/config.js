const { metaGet, metaSet } = require('./db.js');
const KEY = 'config.secondary';

function getSecondary(db) {
  const raw = metaGet(db, KEY);
  return raw ? JSON.parse(raw) : null;
}
function setSecondary(db, { url, model, key }) {
  metaSet(db, KEY, JSON.stringify({ url, model, key }));
}
function maskSecondary(cfg) {
  if (!cfg) return null;
  return { url: cfg.url, model: cfg.model, hasKey: !!cfg.key };
}
module.exports = { getSecondary, setSecondary, maskSecondary };
