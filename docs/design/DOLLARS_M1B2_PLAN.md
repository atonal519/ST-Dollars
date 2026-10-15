# Dollars M1-B2 建世界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M1-B1 识别出的角色，按「用户选的卡类型」定 tier，建成匿名账号（含用户账号）进「大厅」，预览确认后事务写入 SQLite，并把 Universe 绑定到当前 ST 聊天。

**Architecture:** tier 由用户初始化时选的卡类型决定（大世界→全 main / 多人→体量+NSFW 默认可微调 / 单人→main / 模拟器→容忍 0）。前端 `InitPanel` 组件走「选卡类型 → 识别 → 预览(可调 tier) → 确认」；`/init/analyze` 收 cardType 返回带 tier 的角色（不落库），`/init/commit` 收最终角色列表事务建库。复用 M1-A 的 repo。

**Tech Stack:** node:sqlite · Vue3(Shadow DOM) · node:test · 复用 M1-B1 识别管线 + M1-A repo。

**Spec:** `DOLLARS_M1_DESIGN.md`（§4 数据模型 / §7 建世界 / §8 API / §9 Universe 绑定），tier by 卡类型见记忆 `dollars-card-types`。覆盖 spec §12 的 task 7-9。

## Global Constraints

- 后端 server plugin `dollars`（CJS，plugins/dollars/），改后端 `pnpm sync:server` + 重启 ST；改前端 `pnpm build` + 硬刷新。
- **tier 由卡类型定**：`bigworld`/`single`→ 全 main；`multi`→ 体量+专属 NSFW 默认分、用户可微调；`simulator`→ 识别 0 容忍。
- **预览不落库**：`/init/analyze` 只返回识别结果；`/init/commit` 才写 SQLite（事务，全成或回滚）。
- **都建账号**：main 和 npc 都建 Account（标 tier）；另建 1 个 user Account；建 1 个「大厅」public Room；全部 join。
- **匿名不变量**：Account 昵称用占位（`匿名_` + 短随机），不用真名；真实映射存 `Account.owner_character_id`。
- Universe 绑定：`universe_id` 后端 `crypto.randomUUID()` 生成，写库 + 前端存 `chatMetadata['dollars']`（`saveMetadata` 立即落盘）。
- 前端**模块化**：初始化 UI 独立成 `ui/InitPanel` 组件，不堆进 App.vue。

---

## File Structure（M1-B2 产出/改动）

```
server/
├─ tier.js        # 改：assignTiers(characters, worldbook, cardType)
├─ tier.test.mjs  # 改：按卡类型分层测试
├─ analyze.js     # 改：runAnalyze(cfg, {card, worldbook, cardType})
├─ db.js          # 改：migrate 给 account 加 tier 列（ALTER，幂等）
├─ world.js       # 新：buildWorld(db, {universeId, stChatId, characters, cardType}) 事务建库
├─ world.test.mjs # 新
└─ index.js       # 改：/init/analyze 收 cardType；新增 /init/commit、/universe
src/
├─ ui/InitPanel.vue  # 新：选卡类型 → 识别 → 预览(可调 tier) → 确认
├─ App.vue           # 改：用 InitPanel 替换临时"识别测试"块
├─ transport.ts      # 改：analyze 带 cardType；新增 commitWorld / getUniverse
└─ st/chat.ts        # 新：读/写 chatMetadata['dollars']（universe 绑定）
```

---

### Task 1: tier 按卡类型

**Files:** Modify `server/tier.js`, `server/tier.test.mjs`, `server/analyze.js`, `server/index.js`

**Interfaces:**
- Produces: `assignTiers(characters, worldbook, cardType)`——`bigworld`/`single`→全 `main`；`multi`→现有体量+NSFW；其它默认 `multi` 规则。`runAnalyze(cfg, {card, worldbook, cardType})`。`/init/analyze` body 增 `cardType`。

- [ ] **Step 1: 改 tier.test.mjs 增卡类型用例**

在现有测试基础上追加：
```js
test('大世界卡：全部 main（忽略 NSFW/体量）', () => {
  const chars = [{ display_name: 'A' }, { display_name: 'B' }];
  const wb = [{ comment: 'NSFW-A', content: '涩'.repeat(50) }, { comment: '角色_B', content: 'B' }];
  const r = assignTiers(chars, wb, 'bigworld');
  assert.ok(r.every(c => c.tier === 'main'));
});
test('多人卡：沿用体量+NSFW', () => {
  const wb = [{ comment: 'NSFW-A', content: '涩'.repeat(50) }, { comment: '角色_B', content: 'B'.repeat(5) }];
  const r = assignTiers([{ display_name: 'A' }, { display_name: 'B' }], wb, 'multi');
  assert.equal(r.find(c => c.display_name === 'A').tier, 'main');
  assert.equal(r.find(c => c.display_name === 'B').tier, 'npc');
});
```
（`assignTiers` 现有 3 参调用要在旧测试里补 `'multi'` 或让第 3 参默认 `'multi'`。）

- [ ] **Step 2: 运行确认失败** — `cd ST-Dollars/server && node --test tier.test.mjs`（新用例 FAIL：assignTiers 尚不认 cardType）

- [ ] **Step 3: 改 assignTiers 支持 cardType**

`tier.js` 的 `assignTiers` 改为：
```js
function assignTiers(characters, worldbook, cardType = 'multi') {
  const withMeta = characters.map(c => ({ ...c, volume: computeVolume(c, worldbook), nsfw: hasNsfw(c, worldbook) }));
  if (cardType === 'bigworld' || cardType === 'single') {
    return withMeta.map(c => ({ ...c, tier: 'main' }));   // 大世界/单人：识别出的都算主角
  }
  // multi：体量 + 专属 NSFW
  const max = withMeta.reduce((m, c) => Math.max(m, c.volume), 0);
  const anyNsfw = withMeta.some(c => c.nsfw);
  return withMeta.map(c => {
    const tier = anyNsfw ? ((c.nsfw || c.volume >= max * 0.8) ? 'main' : 'npc') : (c.volume >= Math.max(1, max * 0.35) ? 'main' : 'npc');
    return { ...c, tier };
  });
}
```

- [ ] **Step 4: 运行确认通过** — `node --test tier.test.mjs`

- [ ] **Step 5: analyze/路由透传 cardType**

`analyze.js`：`runAnalyze(cfg, { card, worldbook, cardType })`，末尾 `assignTiers(mergedChars, entries, cardType)`。
`index.js` 的 `/init/analyze`：从 body 取 `cardType`（默认 `'multi'`），传入 `runAnalyze`。

- [ ] **Step 6: sync + 提交**

```bash
cd ST-Dollars && pnpm sync:server && git add -A && git commit -m "feat(m1b2): tier by card type (bigworld/single -> all main)"
```

---

### Task 2: account 加 tier 列 + 建世界 buildWorld

**Files:** Modify `server/db.js`; Create `server/world.js`, `server/world.test.mjs`

**Interfaces:**
- Consumes: repo（M1-A：createUniverse/insertCharacter/insertAccount/createRoom/addMembership）。
- Produces: `buildWorld(db, {universeId, stChatId, characters, cardType}) -> {counts}`——事务内建 Universe + 每角色 Character+Account(带 tier) + user Account + 大厅 Room + 全员 membership。

- [ ] **Step 1: db.js migrate 给 account 加 tier 列（幂等）**

在 `migrate(db)` 末尾追加（`ALTER` 重复会抛错，用 try 包）：
```js
  try { db.exec(`ALTER TABLE account ADD COLUMN tier TEXT DEFAULT 'main';`); } catch { /* 已存在 */ }
```

- [ ] **Step 2: 写失败测试**

`server/world.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate } = require('./db.js');
const { buildWorld } = require('./world.js');
const { countsByUniverse } = require('./repo.js');

test('建世界：角色→账号(带tier) + user账号 + 大厅 + 全员join', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-world-'));
  const db = openDb(dir); migrate(db);
  const r = buildWorld(db, {
    universeId: 'u1', stChatId: 'chat-1', cardType: 'multi',
    characters: [
      { display_name: '伊泽尔', aliases: ['二皇子'], summary: 's', tier: 'main' },
      { display_name: '奥古斯都', aliases: [], summary: 's', tier: 'npc' },
    ],
  });
  // 2 角色账号 + 1 user 账号 = 3；1 房间
  assert.deepEqual(countsByUniverse(db, 'u1'), { characters: 2, accounts: 3, rooms: 1 });
  // 全员进大厅 = 3 membership
  const m = db.prepare('SELECT COUNT(*) n FROM room_membership WHERE universe_id=?').get('u1').n;
  assert.equal(m, 3);
  // tier 落到 account
  const tiers = db.prepare("SELECT tier FROM account WHERE account_kind='character' AND universe_id=?").all('u1').map(x => x.tier).sort();
  assert.deepEqual(tiers, ['main', 'npc']);
  db.close();
});
```

- [ ] **Step 3: 运行确认失败** — `node --test world.test.mjs`（world.js 不存在）

- [ ] **Step 4: 实现 world.js**

```js
const crypto = require('node:crypto');
const { createUniverse, insertCharacter, insertAccount, createRoom, addMembership } = require('./repo.js');

const NICK_ADJ = ['沉默', '夜行', '匿名', '无名', '路过', '深蓝', '灰烬', '孤影'];
function placeholderNick() { return NICK_ADJ[Math.floor(0)] + '_' + crypto.randomUUID().slice(0, 4); }
function randColor() { const h = Math.abs(crypto.randomUUID().split('-')[0].split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360; return `hsl(${h} 60% 55%)`; }

function buildWorld(db, { universeId, stChatId, characters, cardType }) {
  const tx = db.prepare('BEGIN'); // node:sqlite: 用 exec 手动事务
  db.exec('BEGIN');
  try {
    createUniverse(db, { universeId, stChatId });
    const roomId = 'room_' + crypto.randomUUID().slice(0, 8);
    // 用户账号
    const userAcc = 'acc_' + crypto.randomUUID().slice(0, 8);
    insertAccount(db, { accountId: userAcc, universeId, ownerUserId: 'user', accountKind: 'user', nickname: '我', avatarColor: '#e5e7eb' });
    // 大厅（创建者记为 user）
    createRoom(db, { roomId, universeId, type: 'public', name: '大厅', createdByAccountId: userAcc });
    addMembership(db, { id: 'mem_' + crypto.randomUUID().slice(0, 8), universeId, roomId, accountId: userAcc, state: 'joined' });
    // 角色账号
    for (const c of characters) {
      const charId = 'char_' + crypto.randomUUID().slice(0, 8);
      const accId = 'acc_' + crypto.randomUUID().slice(0, 8);
      insertCharacter(db, { characterId: charId, universeId, sourceType: 'worldbook_entry', sourceRef: null, displayName: c.display_name, persona: JSON.stringify({ summary: c.summary || '' }), aliases: JSON.stringify(c.aliases || []) });
      insertAccountWithTier(db, { accountId: accId, universeId, ownerCharacterId: charId, accountKind: 'character', nickname: placeholderNick(), avatarColor: randColor(), tier: c.tier || 'main' });
      addMembership(db, { id: 'mem_' + crypto.randomUUID().slice(0, 8), universeId, roomId, accountId: accId, state: 'joined' });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { counts: { characters: characters.length, accounts: characters.length + 1, rooms: 1 } };
}

// repo.insertAccount 不含 tier，这里单独写带 tier 的插入
function insertAccountWithTier(db, a) {
  db.prepare(`INSERT INTO account (account_id,universe_id,owner_character_id,owner_user_id,account_kind,nickname,avatar_color,tier,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(a.accountId, a.universeId, a.ownerCharacterId ?? null, null, a.accountKind, a.nickname ?? null, a.avatarColor ?? null, a.tier, Date.now());
}
module.exports = { buildWorld };
```
> 注：删掉误加的 `const tx = db.prepare('BEGIN')` 那行（笔误），只用 `db.exec('BEGIN'/'COMMIT'/'ROLLBACK')` 做事务。

- [ ] **Step 5: 运行确认通过** — `node --test world.test.mjs`

- [ ] **Step 6: sync + 提交**

```bash
cd ST-Dollars && pnpm sync:server && git add -A && git commit -m "feat(m1b2): buildWorld (accounts by tier + user + hall + memberships) in tx"
```

---

### Task 3: /init/commit + /universe 路由

**Files:** Modify `server/index.js`

**Interfaces:**
- Produces: `POST /init/commit` body `{stChatId, cardType, characters}` → 生成 universeId → `buildWorld` → `{ok, universeId, counts}`；`GET /universe?stChatId=` → `{universe?, counts?}`。

- [ ] **Step 1: index.js 加路由**

顶部 `const crypto = require('node:crypto'); const { buildWorld } = require('./world.js'); const { getUniverseByChat, countsByUniverse } = require('./repo.js');`
在 `/init/analyze` 后：
```js
  router.post('/init/commit', (req, res) => {
    try {
      const { stChatId, cardType, characters } = req.body || {};
      if (!stChatId || !Array.isArray(characters)) return res.status(400).json({ ok: false, error: '缺 stChatId / characters' });
      const existing = getUniverseByChat(db, stChatId);
      if (existing) return res.status(409).json({ ok: false, error: '该聊天已初始化 Universe', universeId: existing.universe_id });
      const universeId = crypto.randomUUID();
      const r = buildWorld(db, { universeId, stChatId, characters, cardType: cardType || 'multi' });
      res.json({ ok: true, universeId, counts: r.counts });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.get('/universe', (req, res) => {
    const u = getUniverseByChat(db, req.query.stChatId || '');
    res.json({ universe: u || null, counts: u ? countsByUniverse(db, u.universe_id) : null });
  });
```

- [ ] **Step 2: sync + 手动验收（curl 或等前端）**

```bash
cd ST-Dollars && pnpm sync:server
```
重启 ST 后由 Task 4 前端联调；后端此步无独立自动测（路由逻辑薄，靠端到端）。

- [ ] **Step 3: 提交** — `git add -A && git commit -m "feat(m1b2): /init/commit (tx build + universe binding) + /universe"`

---

### Task 4: 前端初始化 UI（InitPanel 组件）

**Files:** Create `src/ui/InitPanel.vue`, `src/st/chat.ts`; Modify `src/App.vue`, `src/transport.ts`

**Interfaces:**
- Consumes: `analyze`（+cardType）、后端 `/init/commit`、`getContext().chatId/saveMetadata`。
- Produces: `transport.commitWorld(payload)`、`getUniverse(stChatId)`；`st/chat.ts` 读写 `chatMetadata['dollars']`。

- [ ] **Step 1: transport.ts 加 commit/universe**

```ts
export async function commitWorld(payload: any): Promise<any> {
  const res = await fetch('/api/plugins/dollars/init/commit', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const t = await res.text(); try { return JSON.parse(t); } catch { return { ok: false, error: `HTTP ${res.status}` }; }
}
export async function getUniverse(stChatId: string): Promise<any> {
  const res = await fetch('/api/plugins/dollars/universe?stChatId=' + encodeURIComponent(stChatId), { headers: headers() });
  return res.ok ? res.json() : null;
}
```

- [ ] **Step 2: st/chat.ts（读当前 chatId + 存绑定）**

```ts
import { getContext } from '@/st/context';
export function currentChatId(): string { return getContext()?.chatId ?? getContext()?.getCurrentChatId?.() ?? ''; }
export function saveUniverseBinding(universeId: string) {
  const ctx = getContext(); if (!ctx) return;
  ctx.chatMetadata = ctx.chatMetadata || {};
  ctx.chatMetadata['dollars'] = { universe_id: universeId, schema_version: 1 };
  ctx.saveMetadata?.();
}
```

- [ ] **Step 3: InitPanel.vue（选卡类型 → 识别 → 预览可调 tier → 确认）**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { readSource } from '@/st/reader';
import { analyze, commitWorld } from '@/transport';
import { currentChatId, saveUniverseBinding } from '@/st/chat';

const cardType = ref('multi');
const chars = ref<any[]>([]);
const msg = ref('');
const busy = ref(false);
const done = ref(false);

async function recognize() {
  busy.value = true; msg.value = '识别中…'; done.value = false;
  try {
    const src = await readSource();
    const r = await analyze({ ...src, cardType: cardType.value });
    if (!r?.ok) { msg.value = '失败：' + (r?.error || '未知'); chars.value = []; }
    else { chars.value = r.characters || []; msg.value = `识别 ${chars.value.length} 个角色（可下面微调主角/NPC）`; }
  } catch (e: any) { msg.value = '出错：' + (e?.message || e); }
  busy.value = false;
}
function toggleTier(c: any) { c.tier = c.tier === 'main' ? 'npc' : 'main'; }
async function commit() {
  busy.value = true; msg.value = '建立中…';
  try {
    const r = await commitWorld({ stChatId: currentChatId(), cardType: cardType.value, characters: chars.value });
    if (!r?.ok) { msg.value = '建立失败：' + (r?.error || '未知'); }
    else { saveUniverseBinding(r.universeId); done.value = true; msg.value = `已建立 Universe：${JSON.stringify(r.counts)}`; }
  } catch (e: any) { msg.value = '出错：' + (e?.message || e); }
  busy.value = false;
}
</script>

<template>
  <div class="dollars-init">
    <div class="dollars-row">
      <label>卡类型：</label>
      <select v-model="cardType">
        <option value="single">单人卡</option>
        <option value="multi">多人卡</option>
        <option value="bigworld">大世界卡</option>
        <option value="simulator">模拟器卡</option>
      </select>
      <button :disabled="busy" @click="recognize">识别</button>
    </div>
    <div v-for="c in chars" :key="c.display_name" class="dollars-char" @click="toggleTier(c)">
      <span :class="c.tier === 'main' ? 'dollars-main' : 'dollars-npc'">{{ c.tier === 'main' ? '主' : 'NPC' }}</span>
      {{ c.display_name }}
    </div>
    <button v-if="chars.length && !done" :disabled="busy" class="dollars-commit" @click="commit">确认建立（{{ chars.length }} 角色 + 我 → 大厅）</button>
    <div class="dollars-msg">{{ msg }}</div>
  </div>
</template>
```

- [ ] **Step 4: App.vue 用 InitPanel 替换临时识别块**

`App.vue` 移除临时 `runAnalyze`/`anaMsg` 相关，`<template>` 里加 `<InitPanel />`（`import InitPanel from '@/ui/InitPanel.vue'`）；保留设置区（Secondary API）。

- [ ] **Step 5: 样式（styles.css 追加）**

```css
.dollars-init { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.dollars-char { font-size: 12px; padding: 3px 6px; border: 1px solid #26262e; border-radius: 6px; cursor: pointer; }
.dollars-main { color: #f59e0b; font-weight: 600; }
.dollars-npc { color: #6b7280; }
.dollars-commit { background: #f59e0b; color: #1a1a1a; border: none; border-radius: 8px; padding: 7px; font-size: 13px; cursor: pointer; font-weight: 600; }
.dollars-msg { font-size: 11px; color: #8b8b96; white-space: pre-wrap; }
```

- [ ] **Step 6: 构建 + 提交** — `pnpm build && pnpm sync:server && git add -A && git commit -m "feat(m1b2): InitPanel (card-type select, recognize, tier toggle, commit)"`

---

### Task 5: 端到端验收

- [ ] **Step 1: 手动全流程**（重启 ST + 硬刷新）
  1. 打开面板 → 选卡类型（恶女选「多人卡」/全息玫瑰选「大世界卡」）→ 点识别
  2. 预览列出角色 + tier；点角色可切换 主/NPC
  3. 点「确认建立」→ 显示 `已建立 Universe：{characters, accounts, rooms}`
  4. 刷新页面 → 面板应识别到"该聊天已初始化"（`getUniverse` 返回已存）
- [ ] **Step 2: 核对**：多人卡默认 8 main+3 npc、大世界卡全 main；commit 后 `GET /universe` 计数正确（角色数 / 账号数=角色+1 / 房间=1）。
- [ ] **Step 3: 提交** — `git add -A && git commit -m "feat(m1b2): end-to-end init flow verified (M1-B2 done)"`

---

## Self-Review

- **Spec coverage**：tier by 卡类型（§ 记忆 card-types）✓T1；建世界（§7：角色→账号+user+大厅+membership，tier）✓T2；/init/commit 事务 + Universe 绑定（§8/§9）✓T3；前端选类型+预览可调+确认（§8.1）✓T4；端到端 ✓T5。
- **Placeholder scan**：无 TBD；Step 4 world.js 标注了"删掉误加的 tx 行"（实现时注意）。
- **Type consistency**：`assignTiers(_,_,cardType)`(T1) 与 analyze/路由一致；`buildWorld({universeId,stChatId,characters,cardType})`(T2) 与 /init/commit(T3) 一致；前端 `commitWorld`/`getUniverse`(T4) 与后端路由路径一致；`countsByUniverse` 复用 M1-A。
- **务实取舍**：account 加 tier 用 ALTER（幂等 try 包）避免重建表；user 账号昵称「我」固定、角色账号占位匿名昵称；预览 tier 前端可点切换（多人卡微调），大世界/单人默认全 main。
- **边界**：模拟器卡（0 识别）→ 角色列表空、不建角色账号（可只建 user+大厅 或提示"靠剧情生成"，端到端确认体验）。
