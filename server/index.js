const fs = require('node:fs');
const path = require('node:path');
const { openDb, migrate, metaGet, metaSet } = require('./db.js');
const { getSecondary, setSecondary, maskSecondary } = require('./config.js');
const { callSecondary } = require('./llm.js');
const { runAnalyze } = require('./analyze.js');

const info = { id: 'dollars', name: 'Dollars', description: 'Dollars for SillyTavern — server plugin' };

let db = null;
function protocolVersion() {
  try {
    const p = path.join(__dirname, 'shared', 'protocol.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).protocolVersion;
  } catch { return null; }
}

async function init(router) {
  // 路由必须在首个 await 前同步注册
  router.get('/health', (req, res) => {
    let dbState = 'error';
    try { migrate(db); metaSet(db, 'last_health', String(Date.now())); metaGet(db, 'last_health'); dbState = 'ok'; }
    catch (e) { dbState = 'error:' + (e && e.message); }
    res.json({ ok: true, protocolVersion: protocolVersion(), db: dbState });
  });

  // 配置：Secondary API 存取（key 存后端，GET 打码）
  router.use(require('express').json({ limit: '256kb' }));
  router.post('/config/secondary', (req, res) => {
    const { url, model, key } = req.body || {};
    if (!url || !model) return res.status(400).json({ error: 'url 和 model 必填' });
    const prev = getSecondary(db);
    setSecondary(db, { url, model, key: key || prev?.key || '' });   // key 留空则保留原 key
    res.json({ ok: true, config: maskSecondary(getSecondary(db)) });
  });
  router.get('/config', (req, res) => res.json({ secondary: maskSecondary(getSecondary(db)) }));
  router.post('/llm/ping', async (req, res) => {
    try {
      const out = await callSecondary(getSecondary(db), [{ role: 'user', content: '只回复两个字：在的' }], { maxTokens: 32, temperature: 0 });
      res.json({ ok: true, reply: out });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message });
    }
  });
  // 初始化分析：两阶段识别角色（不落库）
  router.post('/init/analyze', async (req, res) => {
    try {
      const { card, worldbook } = req.body || {};
      if (!Array.isArray(worldbook)) return res.status(400).json({ ok: false, error: '缺少 worldbook' });
      const cfg = getSecondary(db);
      if (!cfg?.url || !cfg?.key) return res.status(400).json({ ok: false, error: '请先配置 Secondary API' });
      const result = await runAnalyze(cfg, { card, worldbook });
      res.json({ ok: true, ...result });
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  // 同步注册完毕后再做异步初始化
  db = openDb(__dirname);
  migrate(db);
}
async function exit() { try { db && db.close(); } catch {} }

module.exports = { info, init, exit };
