# Dollars M1-A 基座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 M1 初始化打好基座——建齐 5 张领域表、能存取用户的 Secondary API 配置、后端能真正调通用户配的 LLM（实测）。

**Architecture:** 沿用 M0 的 `node:sqlite` 后端；新增领域表迁移 + repo 读写层；配置复用 `_meta` 表；后端**直接 `fetch` 用户的 OpenAI 兼容端点**（Node 端无 CORS 限制、key 不出后端，这是 server plugin 相对前端的优势）。手写轻量校验（不引入 zod，避免后端第三方依赖分发问题；M1 schema 简单，手写可测）。

**Tech Stack:** node:sqlite（后端）· Node 全局 fetch · node:test · 前端 Vue3（M0 已有）。

**Spec:** `DOLLARS_M1_DESIGN.md`（同目录，§4 数据模型 / §6 LLM / §8 API）。M1-A 覆盖 spec §12 的 task 1-3。

## Global Constraints

- 后端 server plugin id `dollars`，CommonJS，部署在 `plugins/dollars/`，路由 `/api/plugins/dollars/*`。
- 数据库 `node:sqlite`（`DatabaseSync`），DB 文件 `plugins/dollars/dollars.db`（M0 已建，含 `_meta`）。
- 所有领域表带 `universe_id` + `created_at`；ID 用 uuid（后端 `crypto.randomUUID()`）。
- 写请求前端带 CSRF（`getContext().getRequestHeaders()`）；GET 免。
- **AI 质量优先于成本**、**分析与生成拆开**、**失败即停不诈尸**（spec §2）。
- 后端调 LLM 直接 `fetch(<url>/chat/completions)`，Bearer key；key 只存后端、GET 配置时打码。
- 改后端需 `pnpm sync:server` + 重启 ST；改前端 `pnpm build` + 硬刷新。

---

## File Structure（M1-A 产出/改动）

```
server/
├─ db.js          # 改：migrate() 增建 5 张领域表（保留 _meta）
├─ repo.js        # 新：领域读写（universe/character/account/room/membership + counts）
├─ repo.test.mjs  # 新：repo TDD
├─ config.js      # 新：Secondary API 配置存取（基于 _meta）
├─ llm.js         # 新：调用户 Secondary API（fetch + 手写校验）
├─ llm.test.mjs   # 新：校验纯函数 TDD
└─ index.js       # 改：注册 /config/secondary、/config、/llm/ping 路由
src/
├─ ui/settings...  # 前端设置区（填 url/key/model + 测试连接）——M1-A 简版并入 App
└─ transport.ts    # 改：加 saveConfig/getConfig/pingLlm
shared/protocol.json # 改：protocolVersion 1 → 2（新增了 API，前后端一起升）
```

---

### Task 1: 数据模型 5 表 + repo 读写

**Files:**
- Modify: `server/db.js`（`migrate` 增建 5 表）
- Create: `server/repo.js`, `server/repo.test.mjs`

**Interfaces:**
- Consumes: `openDb(dir)`（M0）。
- Produces: `repo.js` 导出 `createUniverse(db,{universeId,stChatId})`、`getUniverseByChat(db,stChatId)`、`insertCharacter(db,c)`、`insertAccount(db,a)`、`createRoom(db,r)`、`addMembership(db,m)`、`countsByUniverse(db,universeId) -> {characters,accounts,rooms}`。

- [ ] **Step 1: db.js 的 migrate 增建 5 表**

在 `server/db.js` 的 `migrate(db)` 里，`_meta` 建表之后追加：
```js
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
```

- [ ] **Step 2: 写失败测试**

`server/repo.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { createUniverse, getUniverseByChat, insertCharacter, insertAccount, createRoom, addMembership, countsByUniverse } = require('./repo.js');

test('建 universe/角色/账号/房间/成员 并统计', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-repo-'));
  const db = openDb(dir); migrate(db);
  const u = 'u1';
  createUniverse(db, { universeId: u, stChatId: 'chat-1' });
  assert.equal(getUniverseByChat(db, 'chat-1').universe_id, u);
  insertCharacter(db, { characterId: 'c1', universeId: u, sourceType: 'worldbook_entry', sourceRef: 'uid-9', displayName: '伊泽尔', persona: '{}', aliases: '["二皇子"]' });
  insertAccount(db, { accountId: 'a1', universeId: u, ownerCharacterId: 'c1', accountKind: 'character', nickname: '匿名_x1', avatarColor: '#abc' });
  insertAccount(db, { accountId: 'au', universeId: u, ownerUserId: 'user', accountKind: 'user', nickname: '我', avatarColor: '#ddd' });
  createRoom(db, { roomId: 'r1', universeId: u, type: 'public', name: '大厅', createdByAccountId: 'au' });
  addMembership(db, { id: 'm1', universeId: u, roomId: 'r1', accountId: 'a1', state: 'joined' });
  addMembership(db, { id: 'm2', universeId: u, roomId: 'r1', accountId: 'au', state: 'joined' });
  assert.deepEqual(countsByUniverse(db, u), { characters: 1, accounts: 2, rooms: 1 });
  db.close();
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd ST-Dollars/server && node --test repo.test.mjs`
Expected: FAIL（`repo.js` 不存在）

- [ ] **Step 4: 实现 repo.js**

```js
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
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test repo.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
cd ST-Dollars && git add -A && git commit -m "feat(m1a): domain schema (5 tables) + repo layer"
```

---

### Task 2: Secondary API 配置存取

**Files:**
- Create: `server/config.js`
- Modify: `server/index.js`（加 `/config/secondary`、`/config`）
- Modify: `src/transport.ts`（加 `saveConfig`/`getConfig`）、`src/App.vue`（设置区）

**Interfaces:**
- Consumes: `metaGet/metaSet`（M0 db.js）。
- Produces: `config.js` 导出 `getSecondary(db) -> {url,model,key}|null`、`setSecondary(db,{url,model,key})`、`maskSecondary(cfg) -> {url,model,hasKey}`。路由 `POST /config/secondary`、`GET /config`。

- [ ] **Step 1: 写失败测试（config 存取 + 打码）**

`server/config.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { getSecondary, setSecondary, maskSecondary } = require('./config.js');

test('存取 Secondary 配置 + 打码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-cfg-'));
  const db = openDb(dir); migrate(db);
  assert.equal(getSecondary(db), null);
  setSecondary(db, { url: 'https://api.x.com/v1', model: 'gpt-4o-mini', key: 'sk-secret' });
  assert.equal(getSecondary(db).key, 'sk-secret');
  assert.deepEqual(maskSecondary(getSecondary(db)), { url: 'https://api.x.com/v1', model: 'gpt-4o-mini', hasKey: true });
  db.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd ST-Dollars/server && node --test config.test.mjs` → FAIL

- [ ] **Step 3: 实现 config.js**

```js
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
```

- [ ] **Step 4: 运行确认通过** → `node --test config.test.mjs` PASS

- [ ] **Step 5: index.js 加路由**

在 `init(router)` 的同步注册段加（`db` 变量在 M0 已有）：
```js
const { getSecondary, setSecondary, maskSecondary } = require('./config.js');
// ...在 /health 之后：
router.use(require('express').json({ limit: '256kb' }));
router.post('/config/secondary', (req, res) => {
  const { url, model, key } = req.body || {};
  if (!url || !model) return res.status(400).json({ error: 'url 和 model 必填' });
  const prev = getSecondary(db);
  setSecondary(db, { url, model, key: key || prev?.key || '' });   // key 留空则保留原 key
  res.json({ ok: true, config: maskSecondary(getSecondary(db)) });
});
router.get('/config', (req, res) => res.json({ secondary: maskSecondary(getSecondary(db)) }));
```
> 注：`express` 从宿主 require（server plugin 运行在 ST 进程内，`express` 是 ST 依赖，可直接 require）。

- [ ] **Step 6: 前端 transport.ts 加配置调用**

```ts
export async function getConfig(): Promise<any> {
  const res = await fetch('/api/plugins/dollars/config', { headers: getContext()?.getRequestHeaders?.() ?? {} });
  return res.ok ? res.json() : null;
}
export async function saveSecondary(cfg: { url: string; model: string; key: string }): Promise<any> {
  const res = await fetch('/api/plugins/dollars/config/secondary', {
    method: 'POST',
    headers: { ...(getContext()?.getRequestHeaders?.() ?? {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  return res.ok ? res.json() : Promise.reject(new Error('保存失败 ' + res.status));
}
```

- [ ] **Step 7: App.vue 加设置区**（填 url/model/key + 保存）

在 `App.vue` template 里 `dollars-status` 下方加（`<script setup>` 里补 `import { ref } from 'vue'; import { saveSecondary, getConfig } from '@/transport';` 与三个 `ref` + `onMounted` 拉 getConfig 回填 url/model、`save()` 调 saveSecondary）：
```vue
    <div class="dollars-cfg">
      <input v-model="url" placeholder="Secondary API URL (…/v1)" />
      <input v-model="model" placeholder="模型名" />
      <input v-model="key" type="password" placeholder="API Key（留空=不改）" />
      <button @click="save">保存</button>
      <span>{{ cfgMsg }}</span>
    </div>
```

- [ ] **Step 8: 构建 + 提交**

```bash
cd ST-Dollars && pnpm build && pnpm sync:server && git add -A && git commit -m "feat(m1a): secondary API config store + settings UI"
```
（手动：重启 ST，面板设置区能保存、刷新后 url/model 回填、key 显示为已设置。）

---

### Task 3: 后端调 LLM 通道（实测调通）

**Files:**
- Create: `server/llm.js`, `server/llm.test.mjs`
- Modify: `server/index.js`（加 `/llm/ping`）、`src/App.vue`（测试按钮）、`src/transport.ts`（pingLlm）

**Interfaces:**
- Consumes: `getSecondary(db)`。
- Produces: `llm.js` 导出 `extractContent(data) -> string`（手写校验，抛错即失败）、`callSecondary(cfg, messages, {maxTokens,temperature,signal}) -> Promise<string>`。路由 `POST /llm/ping`。

- [ ] **Step 1: 写失败测试（响应提取纯函数）**

`server/llm.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractContent } = require('./llm.js');

test('正常响应提取 content', () => {
  assert.equal(extractContent({ choices: [{ message: { content: 'hi' } }] }), 'hi');
});
test('空 content 抛错', () => {
  assert.throws(() => extractContent({ choices: [{ message: { content: '' } }] }), /空/);
});
test('错误响应抛错', () => {
  assert.throws(() => extractContent({ error: { message: 'bad key' } }), /bad key/);
});
```

- [ ] **Step 2: 运行确认失败** → `cd ST-Dollars/server && node --test llm.test.mjs` FAIL

- [ ] **Step 3: 实现 llm.js**

```js
function extractContent(data) {
  if (data?.error) throw new Error('API 返回错误: ' + (data.error.message || JSON.stringify(data.error)));
  const c = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  if (typeof c !== 'string' || !c.trim()) throw new Error('模型返回空内容');
  return c.trim();
}
// 后端直接 fetch 用户端点（Node 无 CORS）；url 末尾补 /chat/completions
async function callSecondary(cfg, messages, { maxTokens = 1024, temperature, signal } = {}) {
  if (!cfg?.url || !cfg?.key) throw new Error('Secondary API 未配置');
  const base = String(cfg.url).replace(/\/+$/, '');
  const endpoint = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const body = { model: cfg.model, messages, stream: false };
  if (Number.isFinite(maxTokens)) body.max_tokens = maxTokens;
  if (Number.isFinite(temperature)) body.temperature = temperature;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 200));
  return extractContent(await res.json());
}
module.exports = { extractContent, callSecondary };
```

- [ ] **Step 4: 运行确认通过** → `node --test llm.test.mjs` PASS

- [ ] **Step 5: index.js 加 /llm/ping**

```js
const { getSecondary } = require('./config.js');
const { callSecondary } = require('./llm.js');
router.post('/llm/ping', async (req, res) => {
  try {
    const cfg = getSecondary(db);
    const out = await callSecondary(cfg, [{ role: 'user', content: '只回复两个字：在的' }], { maxTokens: 32, temperature: 0 });
    res.json({ ok: true, reply: out });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});
```

- [ ] **Step 6: 前端 transport.ts + App.vue 加"测试连接"**

`transport.ts`:
```ts
export async function pingLlm(): Promise<any> {
  const res = await fetch('/api/plugins/dollars/llm/ping', {
    method: 'POST', headers: getContext()?.getRequestHeaders?.() ?? {},
  });
  return res.json();
}
```
`App.vue` 设置区加按钮 `<button @click="test">测试连接</button>`，`test()` 调 `pingLlm()`，把 `reply` 或 `error` 显示到 `cfgMsg`。

- [ ] **Step 7: 构建 + 同步 + 端到端手动验收**

```bash
cd ST-Dollars && pnpm build && pnpm sync:server
```
手动（**这步验证 LLM 通道**）：重启 ST → 面板设置区填你真实的 Secondary API（url/model/key）→ 保存 → 点「测试连接」→ 应显示模型回复「在的」之类。失败则显示明确错误（key 错/地址错/超时）。

- [ ] **Step 8: 升协议版本 + 提交**

把 `shared/protocol.json` 的 `protocolVersion` 改为 `2`（前后端新增了配置/LLM 接口），`pnpm build && pnpm sync:server`，然后：
```bash
git add -A && git commit -m "feat(m1a): backend LLM channel to user's secondary API + ping (M1-A done)"
```

---

## Self-Review

- **Spec coverage**（对 M1_DESIGN §12 task 1-3）：5 表数据模型 + repo ✓(T1)；Secondary API 配置存取（key 后端 + 打码）✓(T2)；后端 LLM 调用封装 + 实测通道 ✓(T3)。§4 数据模型全表落地 ✓。§2 原则：失败即停（extractContent/callSecondary 抛错，ping 返回错误）✓。
- **Placeholder scan**：无 TBD；每步有实际代码/命令 + 预期。
- **Type consistency**：`openDb/migrate/metaGet/metaSet`（M0）→ T1/T2 一致引用；`getSecondary/setSecondary/maskSecondary`（config.js）T2 定义、T3 与 index.js 一致；`callSecondary/extractContent`（llm.js）T3 定义并被 index.js 用；前端 `saveSecondary/getConfig/pingLlm`（transport.ts）与后端路由路径一致。
- **务实取舍**：不引入 zod（后端依赖分发问题），手写 `extractContent` 校验（可 TDD）；后端直接 fetch 用户端点（无 CORS、key 不出后端），区别于前端走 ST 代理。
- **边界**：M1-A 只到"能调通 LLM"，不含角色识别/建世界（那是 M1-B）。
