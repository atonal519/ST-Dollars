# Dollars M2-A 编排后端化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把灵魂 demo 的 Conversation Cycle 平移到后端，读 M1 建好的 SQLite 账号/persona/房间跑一轮编排，消息落库；脚本自测"大厅角色能真聊起来"。

**Architecture:** 新增 Message 表 + repo；Primary API 配置（与 Secondary 并列，cycle 缺 Primary 时回退用 Secondary）；`llm.js` 通用 `callLLM(cfg,…)`；`buildContext()` 抽出房间上下文（简化版，预留替换）；`cycle.js` 平移 demo 五环（Secondary 筛候选/选人/判停 + Primary Intent/台词），台词落库；`POST /cycle/run` 触发，`_cycle_test.mjs` 脚本自测。

**Tech Stack:** node:sqlite · Node fetch · node:test · 复用 M1 repo/llm/jsonutil · 前端 Vue3（仅顺带加 Primary 输入）。

**Spec:** `DOLLARS_M2A_DESIGN.md`（同目录，§4 编排 / §5 上下文 / §10 预留接口）。

## Global Constraints

- 后端 CJS in `plugins/dollars/`；改后端 `pnpm sync:server` + 重启 ST；改前端 `pnpm build` + 硬刷新。
- **先平等**：cycle 所有 `character` 账号平等参与候选筛选，不据 tier 分精度；但 `account.tier` 透传（预留分级）。
- **仅 text 消息**：`insertMessage({type})` 参数化、`Message.type` 枚举预留其它类型。
- **失败即停不诈尸**：Primary 失败停内容、Secondary 失败停状态；已落库消息不回滚（V1 §6/§19）。
- **上下文简化但可替换**：`buildContext()` 独立函数，M2-A 只给"房间最近消息 + persona"，未来整体换 Context Pack。
- 双 API：调度走 Secondary、台词走 Primary（缺 Primary 回退 Secondary）；均 `callLLM(cfg,…)` 带重试/超时/JSON 健壮解析（复用 M1-B1）。

---

## File Structure（M2-A 产出/改动）

```
server/
├─ db.js         # 改：migrate 增建 message 表
├─ repo.js       # 改：insertMessage / recentMessages / messageCount
├─ repo.test.mjs # 改：message repo 测试
├─ config.js     # 改：getPrimary / setPrimary / maskPrimary
├─ llm.js        # 改：导出通用 callLLM(cfg,messages,opts)（callSecondary 保留为别名）
├─ context.js    # 新：buildContext(db,{roomId,limit}) 组装房间上下文（简化版）
├─ cycle.js      # 新：五环 prompts + runCycle（平移 demo，数据来自 SQLite，落库）
├─ cycle.test.mjs# 新：解析/纯逻辑测试
└─ index.js      # 改：/config/primary、/cycle/run
src/
├─ transport.ts  # 改：savePrimary / runCycle（M2-A 前端仅配置+触发；聊天室 UI 归 M2-B）
└─ App.vue       # 改：设置区加 Primary 那半（复用 Secondary 表单）
scripts(outputs)/
└─ _cycle_test.mjs  # 我的自测脚本（读大厅跑 cycle 打印对话）
```

---

### Task 1: Message 表 + repo

**Files:** Modify `server/db.js`, `server/repo.js`, `server/repo.test.mjs`

**Interfaces:**
- Produces: `insertMessage(db,{messageId,universeId,roomId,senderAccountId,type,content,cycleId,status})`；`recentMessages(db,roomId,limit) -> [{message_id,sender_account_id,type,content,created_at}]`（created_at 升序取最近 limit 条）。

- [ ] **Step 1: db.js migrate 增建 message 表**

`migrate(db)` 末尾（tier ALTER 之后）追加：
```js
  db.exec(`CREATE TABLE IF NOT EXISTS message (
    message_id TEXT PRIMARY KEY, universe_id TEXT, room_id TEXT, sender_account_id TEXT,
    type TEXT, content TEXT, cycle_id TEXT, status TEXT, created_at INTEGER);`);
```

- [ ] **Step 2: 写失败测试**（追加到 `repo.test.mjs`）

```js
import { insertMessage, recentMessages } from './repo.js';
test('消息插入 + 最近N条(升序)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-msg-'));
  const db = openDb(dir); migrate(db);
  for (let i = 0; i < 5; i++) insertMessage(db, { messageId: 'm' + i, universeId: 'u', roomId: 'r', senderAccountId: 'a' + i, type: 'text', content: 'c' + i, cycleId: 'cyc1', status: 'committed' });
  const recent = recentMessages(db, 'r', 3);
  assert.equal(recent.length, 3);
  assert.deepEqual(recent.map(m => m.content), ['c2', 'c3', 'c4']); // 最近3条、升序
  db.close();
});
```

- [ ] **Step 3: 运行确认失败** — `cd ST-Dollars/server && node --test repo.test.mjs`（FAIL：insertMessage 未定义）

- [ ] **Step 4: repo.js 增消息读写**

```js
function insertMessage(db, m) {
  db.prepare(`INSERT INTO message (message_id,universe_id,room_id,sender_account_id,type,content,cycle_id,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(m.messageId, m.universeId, m.roomId, m.senderAccountId, m.type || 'text', m.content ?? '', m.cycleId ?? null, m.status || 'committed', Date.now());
}
function recentMessages(db, roomId, limit = 20) {
  const rows = db.prepare('SELECT * FROM message WHERE room_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(roomId, limit);
  return rows.reverse();  // 转回升序（旧→新）
}
```
（加进 `module.exports`。）

- [ ] **Step 5: 运行确认通过** → `node --test repo.test.mjs`
- [ ] **Step 6: 提交** — `git add -A && git commit -m "feat(m2a): message table + repo (insert/recent)"`

---

### Task 2: Primary API 配置 + 通用 callLLM

**Files:** Modify `server/config.js`, `server/config.test.mjs`, `server/llm.js`, `server/index.js`, `src/transport.ts`, `src/App.vue`

**Interfaces:**
- Produces: `getPrimary/setPrimary/maskPrimary`（config.js，同 secondary，存 `_meta` key `config.primary`）；`callLLM(cfg,messages,opts)`（llm.js 通用，`callSecondary` 保留为别名）；`/config/primary` POST、`/config` GET 增 primary；前端 `savePrimary`。

- [ ] **Step 1: 写失败测试**（config.test.mjs 追加 primary 版，与 secondary 对称）

```js
import { getPrimary, setPrimary, maskPrimary } from './config.js';
test('存取 Primary 配置 + 打码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-p-')); const db = openDb(dir); migrate(db);
  assert.equal(getPrimary(db), null);
  setPrimary(db, { url: 'https://p/v1', model: 'm', key: 'sk' });
  assert.equal(getPrimary(db).key, 'sk');
  assert.deepEqual(maskPrimary(getPrimary(db)), { url: 'https://p/v1', model: 'm', hasKey: true });
  db.close();
});
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: config.js 加 primary（对称 secondary）**

```js
const P_KEY = 'config.primary';
function getPrimary(db) { const r = metaGet(db, P_KEY); return r ? JSON.parse(r) : null; }
function setPrimary(db, { url, model, key }) { metaSet(db, P_KEY, JSON.stringify({ url, model, key })); }
function maskPrimary(cfg) { return cfg ? { url: cfg.url, model: cfg.model, hasKey: !!cfg.key } : null; }
// module.exports 增 getPrimary/setPrimary/maskPrimary
```

- [ ] **Step 4: 运行确认通过** → PASS

- [ ] **Step 5: llm.js 导出通用 callLLM**

`llm.js` 把 `callSecondary` 的实现改名/复制为 `callLLM(cfg, messages, opts)`（逻辑不变），并 `const callSecondary = callLLM;`（保留别名给 /llm/ping）。`module.exports = { extractContent, callLLM, callSecondary };`

- [ ] **Step 6: index.js 加 /config/primary，/config 增 primary**

```js
const { getPrimary, setPrimary, maskPrimary } = require('./config.js');
router.post('/config/primary', (req, res) => {
  const { url, model, key } = req.body || {};
  if (!url || !model) return res.status(400).json({ error: 'url 和 model 必填' });
  const prev = getPrimary(db);
  setPrimary(db, { url, model, key: key || prev?.key || '' });
  res.json({ ok: true, config: maskPrimary(getPrimary(db)) });
});
```
`/config` 返回改为 `{ secondary: maskSecondary(getSecondary(db)), primary: maskPrimary(getPrimary(db)) }`。

- [ ] **Step 7: 前端设置区加 Primary（App.vue + transport）**

`transport.ts` 加 `savePrimary`（同 saveSecondary，打到 `/config/primary`）。`App.vue` 设置区复制一组 Primary 输入（url/model/key + 保存），`onMounted` 回填 `c.primary`。

- [ ] **Step 8: 构建+同步+提交** — `pnpm build && pnpm sync:server && git add -A && git commit -m "feat(m2a): primary API config + generic callLLM"`

---

### Task 3: buildContext + cycle.js（五环平移）

**Files:** Create `server/context.js`, `server/cycle.js`, `server/cycle.test.mjs`

**Interfaces:**
- Consumes: repo（recentMessages + 账号/角色查询）、`callLLM`、jsonutil。
- Produces: `buildContext(db,{roomId,limit}) -> {roomName, accounts:[{account_id,nickname,tier,persona}], recent:[{sender_account_id,nickname,content}]}`；`runCycle({db, cfgPrimary, cfgSecondary, universeId, roomId, onMessage?}) -> {status, produced}`。

- [ ] **Step 1: repo 增房间账号/角色查询**（若无）

`repo.js` 加：
```js
function roomAccounts(db, roomId) {
  return db.prepare(`SELECT a.account_id, a.nickname, a.tier, a.account_kind, a.owner_character_id
    FROM room_membership rm JOIN account a ON a.account_id=rm.account_id
    WHERE rm.room_id=? AND rm.state='joined'`).all(roomId);
}
function characterById(db, characterId) { return db.prepare('SELECT * FROM character WHERE character_id=?').get(characterId); }
// exports 增
```

- [ ] **Step 2: context.js（buildContext，简化版、可替换）**

```js
const { recentMessages, roomAccounts, characterById } = require('./repo.js');
const { getRoom } = require('./repo.js'); // 若无则用 room 查询；见下
function personaOf(db, acc) {
  if (acc.account_kind !== 'character' || !acc.owner_character_id) return '';
  const ch = characterById(db, acc.owner_character_id);
  try { return JSON.parse(ch?.persona || '{}').summary || ''; } catch { return ''; }
}
function buildContext(db, { roomId, limit = 20 }) {
  const accounts = roomAccounts(db, roomId).map(a => ({ account_id: a.account_id, nickname: a.nickname, tier: a.tier, kind: a.account_kind, persona: personaOf(db, a) }));
  const recent = recentMessages(db, roomId, limit).map(m => {
    const acc = accounts.find(x => x.account_id === m.sender_account_id);
    return { sender_account_id: m.sender_account_id, nickname: acc?.nickname || m.sender_account_id, content: m.content };
  });
  return { accounts, recent };
}
module.exports = { buildContext };
```
> 若 repo 无 `getRoom` 就不取房名（cycle 用 roomId 即可）；本函数是未来 Context Pack 的替换点。

- [ ] **Step 3: cycle.js（五环 prompts + runCycle，平移 demo，数据来自 buildContext）**

平移 demo `agents.js`/`orchestrator.js`，改：候选/persona 来自 `buildContext().accounts`（只取 `kind==='character'`），上下文用 `buildContext().recent`，台词 `insertMessage` 落库。关键结构：
```js
const crypto = require('node:crypto');
const { callLLM } = require('./llm.js');
const { extractJson } = require('./jsonutil.js');
const { buildContext } = require('./context.js');
const { insertMessage } = require('./repo.js');

const MAX_TURNS = 6;
const fmtRecent = (recent) => recent.length ? recent.map(m => `[${m.nickname}(${m.sender_account_id})] ${m.content}`).join('\n') : '（暂无消息）';
const fmtRoster = (chars) => chars.map(c => `- ${c.nickname}（account_id:${c.account_id}）persona:${c.persona}`).join('\n');
const ROUTER_SYS = '你是匿名聊天室「Dollars」的调度器，只做机械判断、用 account_id 认人，严格只输出 JSON、无解释无代码围栏。';
const CHAR_SYS = (c) => `你在匿名聊天室「Dollars」里扮演角色。account_id:${c.account_id} 昵称:${c.nickname}。人设：${c.persona}。你只知道自己人设与聊天室公开消息。`;

async function callJSON(cfg, messages, opts) { return extractJson(await callLLM(cfg, messages, opts)); }

async function filterCandidates(cfgS, chars, recent) {
  const u = `房间角色：\n${fmtRoster(chars)}\n\n最近消息：\n${fmtRecent(recent)}\n\n判断此刻有合理动机想行动的候选（无动机别选，可空）。只输出 JSON：{"candidates":[{"account_id":"","reason":""}]}`;
  const d = await callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.3 });
  return Array.isArray(d.candidates) ? d.candidates : [];
}
async function genIntent(cfgP, ch, recent) {
  const u = `最近消息：\n${fmtRecent(recent)}\n\n作为「${ch.nickname}」决定此刻意图（speak/observe/hesitate/leave/ignore，沉默合法）。只输出 JSON：{"action":"","reason":"","topic":""}`;
  return callJSON(cfgP, [{ role: 'system', content: CHAR_SYS(ch) }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.8 });
}
async function pickActor(cfgS, intents, recent) {
  const lines = intents.map(i => `- ${i.nickname}(${i.account_id})：action=${i.action} topic="${i.topic || ''}"`).join('\n');
  const u = `最近消息：\n${fmtRecent(recent)}\n\n候选意图：\n${lines}\n\n从 speak 里选最适合接着说的一个（避免同一人连说），没有就 null。只输出 JSON：{"actor_id":"acc或null","reason":""}`;
  return callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 512, temperature: 0.3 });
}
async function genMessage(cfgP, ch, intent, recent) {
  const u = `最近消息：\n${fmtRecent(recent)}\n\n你（${ch.nickname}）要发言，方向：${intent?.topic || '自然接话'}。像真人群聊、口语简短、无旁白无引号、符合人设。只输出 JSON：{"message":""}`;
  const d = await callJSON(cfgP, [{ role: 'system', content: CHAR_SYS(ch) }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.9 });
  return (d.message || '').toString().trim();
}
async function continueOrStop(cfgS, recent, produced, pending) {
  const w = pending.length ? `还想说但没轮到：${pending.join('、')}。` : '没有其他人明确想说。';
  const u = `最近消息：\n${fmtRecent(recent)}\n\n本轮已产生 ${produced} 条。${w}\n这是多人聊天室，角色可互相接话、不必每次都等用户。判断 continue/stop。只输出 JSON：{"decision":"continue|stop","reason":""}`;
  const d = await callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 512, temperature: 0.2 });
  return d.decision;
}

async function runCycle({ db, cfgPrimary, cfgSecondary, universeId, roomId, onMessage }) {
  const cyc = 'cyc_' + crypto.randomUUID().slice(0, 8);
  let produced = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const ctx = buildContext(db, { roomId });
    const chars = ctx.accounts.filter(a => a.kind === 'character');
    const cand = (await filterCandidates(cfgSecondary, chars, ctx.recent)).filter(c => chars.some(x => x.account_id === c.account_id));
    if (!cand.length) break;
    const intents = await Promise.all(cand.map(async c => {
      const ch = chars.find(x => x.account_id === c.account_id);
      const it = await genIntent(cfgPrimary, ch, ctx.recent);
      return { account_id: c.account_id, nickname: ch.nickname, action: it?.action, topic: it?.topic };
    }));
    const pick = await pickActor(cfgSecondary, intents, ctx.recent);
    const actorId = pick?.actor_id;
    const actor = (actorId && actorId !== 'null') ? chars.find(x => x.account_id === actorId) : null;
    if (!actor) break;
    const intent = intents.find(i => i.account_id === actorId);
    const text = await genMessage(cfgPrimary, actor, intent, ctx.recent);
    if (text) {
      insertMessage(db, { messageId: 'msg_' + crypto.randomUUID().slice(0, 8), universeId, roomId, senderAccountId: actorId, type: 'text', content: text, cycleId: cyc, status: 'committed' });
      produced++;
      onMessage?.({ sender_account_id: actorId, nickname: actor.nickname, content: text });
    }
    if (produced >= MAX_TURNS) break;
    const pending = intents.filter(i => i.action === 'speak' && i.account_id !== actorId).map(i => i.nickname);
    if ((await continueOrStop(cfgSecondary, buildContext(db, { roomId }).recent, produced, pending)) !== 'continue') break;
  }
  return { status: produced > 0 ? 'completed' : 'completed_empty', produced, cycleId: cyc };
}
module.exports = { runCycle, buildContext };
```

- [ ] **Step 4: cycle.test.mjs（纯逻辑：格式化/解析，不打真 LLM）**

测 `fmtRecent`/`fmtRoster` 或抽出的解析；LLM 编排靠 Task 5 脚本集成。（若五环都内联，可只测 buildContext：建库塞消息 → buildContext 返回结构正确。）
```js
// 例：buildContext 组装
test('buildContext 返回房间角色 + 最近消息', () => { /* 建 universe+account+message，assert accounts/recent 结构 */ });
```

- [ ] **Step 5: 提交** — `pnpm sync:server && git add -A && git commit -m "feat(m2a): buildContext + cycle.js (5-stage orchestration ported to backend)"`

---

### Task 4: /cycle/run 接口 + 用户消息 commit

**Files:** Modify `server/index.js`, `src/transport.ts`

**Interfaces:**
- Produces: `POST /cycle/run { universeId, roomId, userMessages? }` → commit 用户消息 → runCycle → `{ok, produced, messages}`。前端 `runCycle(payload)`（M2-B 用；M2-A 脚本直接调 runCycle）。

- [ ] **Step 1: index.js 加 /cycle/run**

```js
const { runCycle } = require('./cycle.js');
const { getPrimary } = require('./config.js');
const { insertMessage, recentMessages } = require('./repo.js');
router.post('/cycle/run', async (req, res) => {
  try {
    const { universeId, roomId, userMessages } = req.body || {};
    if (!universeId || !roomId) return res.status(400).json({ ok: false, error: '缺 universeId/roomId' });
    const cfgSecondary = getSecondary(db);
    const cfgPrimary = getPrimary(db) || cfgSecondary;   // 缺 Primary 回退 Secondary
    if (!cfgSecondary?.url) return res.status(400).json({ ok: false, error: '请先配置 API' });
    for (const um of (userMessages || [])) insertMessage(db, { messageId: 'msg_' + Math.random().toString(36).slice(2, 10), universeId, roomId, senderAccountId: um.accountId || 'acc_user', type: 'text', content: um.content, status: 'committed' });
    const before = recentMessages(db, roomId, 1000).length;
    const r = await runCycle({ db, cfgPrimary, cfgSecondary, universeId, roomId });
    const after = recentMessages(db, roomId, 1000);
    res.json({ ok: true, produced: r.produced, status: r.status, messages: after.slice(Math.max(0, after.length - r.produced)) });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
```

- [ ] **Step 2: transport.ts 加 runCycle**（M2-B 会用）
```ts
export async function runCycle(payload: any): Promise<any> {
  const res = await fetch('/api/plugins/dollars/cycle/run', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const t = await res.text(); try { return JSON.parse(t); } catch { return { ok: false, error: `HTTP ${res.status}` }; }
}
```

- [ ] **Step 3: sync + 提交** — `pnpm sync:server && git add -A && git commit -m "feat(m2a): /cycle/run endpoint + user message commit"`

---

### Task 5: 脚本自测 + 迭代 cycle prompt

**Files:** Create `outputs/_cycle_test.mjs`（我的自测脚本，不进插件仓库）

- [ ] **Step 1: 写 _cycle_test.mjs**（读最新已初始化的 universe + 大厅 room + config，直接 `runCycle`，打印落库对话）

结构类似 `_recon_test.mjs`：`createRequire` 引 `server/cycle.js`/`repo.js`/`config.js`；用 `node:sqlite` 只读读 `getUniverseByChat` 找 universe + 大厅 room_id + `getSecondary/getPrimary`；调 `runCycle({db, cfgPrimary, cfgSecondary, universeId, roomId, onMessage: m => console.log('['+m.nickname+'] '+m.content) })`；跑完打印 produced。

- [ ] **Step 2: 跑** — `node outputs/_cycle_test.mjs`
Expected: 打印大厅里角色你一言我一语的对话（用各自 persona、有来回、可能有人沉默）。**这是 M2-A 的核心验收**。

- [ ] **Step 3: 迭代 cycle prompt** — 看对话质量（是否像各角色、是否所有账号扎堆同一人说、沉默是否合理），像 M1-B1 那样调 prompt 直到像样。

- [ ] **Step 4: 提交**（若脚本迭代改了 cycle.js）— `pnpm sync:server && git add -A && git commit -m "feat(m2a): backend cycle self-tested on real hall — M2-A done"`

---

## Self-Review

- **Spec coverage**：Message 表+repo（§2）✓T1；Primary 配置+callLLM（§3）✓T2；buildContext+cycle 五环平移（§4/§5）✓T3；/cycle/run+用户消息（§6）✓T4；脚本自测+prompt 迭代（§8）✓T5。
- **Placeholder scan**：cycle prompt 为平移初版，标注 T5 迭代；context.js 的 getRoom 标注"无则跳过房名"——非占位，是条件实现。
- **Type consistency**：`insertMessage/recentMessages`(T1) 被 context/cycle/index 一致用；`callLLM`(T2) 被 cycle 用；`buildContext`(T3) 被 cycle 用；`getPrimary`+回退(T2/T4) 一致；`runCycle({db,cfgPrimary,cfgSecondary,universeId,roomId})` 签名 T3 定、T4/T5 调用一致。
- **预留接口**（spec §10）：tier 透传（buildContext accounts 带 tier，cycle 暂不用）；type 参数化；buildContext 独立可换；roomId 参数化；五环独立函数。
- **务实取舍**：cfgPrimary 缺失回退 Secondary（她 Primary/Secondary 常同一个），M2-A 自测不阻塞；前端仅加 Primary 输入，聊天室 UI 全留 M2-B。
