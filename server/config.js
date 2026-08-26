const { metaGet, metaSet } = require('./db.js');
const KEY = 'config.secondary';
const P_KEY = 'config.primary';

function getSecondary(db) { const raw = metaGet(db, KEY); return raw ? JSON.parse(raw) : null; }
function setSecondary(db, { url, model, key }) { metaSet(db, KEY, JSON.stringify({ url, model, key })); }
function maskSecondary(cfg) { if (!cfg) return null; return { url: cfg.url, model: cfg.model, hasKey: !!cfg.key }; }

function getPrimary(db) { const raw = metaGet(db, P_KEY); return raw ? JSON.parse(raw) : null; }
function setPrimary(db, { url, model, key }) { metaSet(db, P_KEY, JSON.stringify({ url, model, key })); }
function maskPrimary(cfg) { if (!cfg) return null; return { url: cfg.url, model: cfg.model, hasKey: !!cfg.key }; }

module.exports = { getSecondary, setSecondary, maskSecondary, getPrimary, setPrimary, maskPrimary };
