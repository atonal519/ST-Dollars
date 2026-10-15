# Dollars M0 地基骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起 Dollars 的 Monorepo 骨架，把「前端扩展 ↔ server plugin ↔ SQLite」这条地基在真实 ST 里一次性跑通（= 验证 RECON 里"没实跑过"的部分）。

**Architecture:** 独立 Monorepo，仓库根即前端扩展本体（放 `third-party/ST-Dollars/`）；后端 `server/` 子目录经同步脚本部署到 `plugins/dollars/`；`shared/` 放跨端协议。M0 只做"最小连通"：后端一个 `/health` 路由 + 一张 SQLite 表读写，前端一个 Shadow DOM 空壳面板显示连通与版本校验结果。

**Tech Stack:** pnpm workspace · Vite + TypeScript + Vue3（前端）· Express router + node:sqlite（Node 内置，后端 CommonJS）· node:test（纯逻辑测试）。

**Spec:** `DOLLARS_V1_TECH_DESIGN.md`（同目录），领域背景见 `DOLLARS_V1_DESIGN.md`。

## Global Constraints

- 仓库根 = `SillyTavern/public/scripts/extensions/third-party/ST-Dollars/`，是前端扩展本体（ST 读根 `manifest.json` + `dist/`）。
- 后端 server plugin：id 固定 `dollars`，目录 `SillyTavern/plugins/dollars/`，**CommonJS**（自带 `package.json` 含 `"type": "commonjs"`），路由自动挂 `/api/plugins/dollars/*`。
- 数据库用 **`node:sqlite`**（Node ≥ 22.5 内置，`DatabaseSync`，免原生依赖/免编译）。⚠️ M0 实测：原计划的 `better-sqlite3` 在该 ST 的 `node_modules` 里**无预编译二进制**（`.node` 缺失），故改用内置 `node:sqlite`。待验：ST server plugin 运行时 Node ≥ 22.5（Task 3 装载时确认）。
- 路由必须**在 `init` 首个 `await` 之前同步注册**（否则加载器不挂载）。
- 前端写请求带 `getContext().getRequestHeaders()` 的 CSRF；M0 只有 GET `/health`，可免。
- 前端 Vite：ST 核心用 `@sillytavern/` 前缀标 external，不打包（照柏宝书 `sillytavern-resolver`）。
- 协议版本单一真相：`shared/protocol.json` 的 `protocolVersion`，前后端都读它。
- 运行前置：`config.yaml` 设 `enableServerPlugins: true` 并**重启 ST**。

---

## File Structure（M0 产出）

```
third-party/ST-Dollars/
├─ package.json                 # workspace 根 + 脚本
├─ pnpm-workspace.yaml
├─ .gitignore
├─ manifest.json                # 前端扩展声明（ST 读）
├─ tsconfig.json
├─ vite.config.ts
├─ shared/
│  └─ protocol.json             # { protocolVersion } 单一真相
├─ src/                         # 前端
│  ├─ index.ts                  # 入口：Shadow DOM 挂载 + 魔杖入口 + 就绪 gating
│  ├─ st/context.ts             # getContext() 封装
│  ├─ transport.ts              # 调后端 /health + 版本校验（含可测纯函数）
│  ├─ transport.test.mjs        # 版本校验单测
│  ├─ App.vue                   # 空壳面板：显示连通/版本状态
│  └─ styles.css                # 面板样式（打进 dist/index.css）
├─ server/                      # 后端（同步到 plugins/dollars/）
│  ├─ package.json              # { "type": "commonjs", "main": "index.js" }
│  ├─ index.js                  # info + init(router)：GET /health
│  ├─ db.js                     # better-sqlite3 建库 + _meta 读写 + 迁移
│  └─ db.test.mjs               # DB 层单测
└─ scripts/
   ├─ sync-server.mjs           # server/ + shared/ → plugins/dollars/
   └─ sync-version.mjs          # package.json version → manifest.json 的 js ?ver=
```

---

### Task 1: Monorepo 骨架 + shared 协议

**Files:**
- Create: `ST-Dollars/package.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.json`
- Create: `ST-Dollars/shared/protocol.json`
- Create: `ST-Dollars/src/transport.test.mjs`（先放版本比较测试；`transport.ts` 的纯函数在 Task 4 实现前，这里先建独立小函数验证逻辑）

**Interfaces:**
- Produces: `shared/protocol.json` = `{ "protocolVersion": 1 }`；纯函数 `isCompatible(clientVer, serverVer) -> boolean`（M0 规则：相等即兼容）。

- [ ] **Step 1: 建仓库根配置文件**

`ST-Dollars/package.json`:
```json
{
  "name": "st-dollars",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/sync-version.mjs && vite build",
    "watch": "node scripts/sync-version.mjs && vite build --watch --mode development",
    "sync:server": "node scripts/sync-server.mjs",
    "test": "node --test"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.7",
    "typescript": "^5.7.0",
    "vite": "^7.3.3",
    "vue-tsc": "^3.3.3"
  },
  "dependencies": {
    "vue": "^3.5.35"
  }
}
```

`ST-Dollars/pnpm-workspace.yaml`:
```yaml
packages: []
```
（M0 单包即可；保留文件为 M1+ 拆包预留。）

`ST-Dollars/.gitignore`:
```
node_modules
*.log
```
（注意：`dist/` **要提交**，不忽略。）

`ST-Dollars/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

- [ ] **Step 2: 建 shared/protocol.json**

```json
{ "protocolVersion": 1 }
```

- [ ] **Step 3: 写失败测试（版本比较）**

`ST-Dollars/src/transport.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompatible } from './transport.logic.mjs';

test('相同协议版本 → 兼容', () => {
  assert.equal(isCompatible(1, 1), true);
});
test('不同协议版本 → 不兼容', () => {
  assert.equal(isCompatible(1, 2), false);
});
test('后端版本缺失 → 不兼容', () => {
  assert.equal(isCompatible(1, undefined), false);
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd ST-Dollars && node --test src/transport.test.mjs`
Expected: FAIL（`transport.logic.mjs` 不存在）

- [ ] **Step 5: 写最小实现**

`ST-Dollars/src/transport.logic.mjs`:
```js
// M0 规则：协议版本严格相等才兼容（后续可放宽为 major 相容）
export function isCompatible(clientVer, serverVer) {
  return Number.isInteger(serverVer) && clientVer === serverVer;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test src/transport.test.mjs`
Expected: PASS ×3

- [ ] **Step 7: 提交**

```bash
git init && git add -A
git commit -m "chore(m0): monorepo scaffold + shared protocol + version-compat test"
```

---

### Task 2: 后端 server plugin 骨架 + SQLite

**Files:**
- Create: `ST-Dollars/server/package.json`, `server/db.js`, `server/index.js`, `server/db.test.mjs`

**Interfaces:**
- Consumes: `shared/protocol.json`（同步后位于 `./shared/protocol.json` 相对插件目录）。
- Produces: `openDb(dir) -> db`；`migrate(db)`（幂等，建 `_meta(key TEXT PRIMARY KEY, value TEXT)`）；`metaGet(db, key)` / `metaSet(db, key, value)`；server 导出 `{ info, init, exit }`，`GET /health -> { ok, protocolVersion, db }`。

- [ ] **Step 1: 后端 package.json（关键：commonjs）**

`ST-Dollars/server/package.json`:
```json
{ "name": "dollars-server", "version": "0.0.1", "type": "commonjs", "main": "index.js", "private": true }
```

- [ ] **Step 2: 写失败测试（DB 层）**

`ST-Dollars/server/db.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { openDb, migrate, metaGet, metaSet } = require('./db.js');

test('建库 + 迁移幂等 + _meta 读写', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollars-'));
  const db = openDb(dir);
  migrate(db); migrate(db);                 // 跑两次验证幂等
  assert.equal(metaGet(db, 'x'), undefined);
  metaSet(db, 'x', 'hello');
  assert.equal(metaGet(db, 'x'), 'hello');
  metaSet(db, 'x', 'world');                // 覆盖
  assert.equal(metaGet(db, 'x'), 'world');
  db.close();
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd ST-Dollars/server && node --test db.test.mjs`
Expected: FAIL（`db.js` 不存在）
> 前置：从该目录能解析到 ST 根的 `better-sqlite3`（ST-Dollars 位于 ST 树内，Node 逐级向上找到 `Luker/node_modules`）。

- [ ] **Step 4: 实现 db.js**

`ST-Dollars/server/db.js`:
```js
const path = require('node:path');
const Database = require('better-sqlite3');

function openDb(dir) {
  return new Database(path.join(dir, 'dollars.db'));
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
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test db.test.mjs`
Expected: PASS

- [ ] **Step 6: 实现 index.js（server plugin 入口）**

`ST-Dollars/server/index.js`:
```js
const fs = require('node:fs');
const path = require('node:path');
const { openDb, migrate, metaGet, metaSet } = require('./db.js');

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
  // 同步注册完毕后再做异步初始化
  db = openDb(__dirname);
  migrate(db);
}
async function exit() { try { db && db.close(); } catch {} }

module.exports = { info, init, exit };
```

- [ ] **Step 7: 提交**

```bash
git add -A && git commit -m "feat(m0): server plugin skeleton + sqlite _meta layer + /health"
```

---

### Task 3: 同步脚本 + 后端装进 ST（手动验收）

**Files:**
- Create: `ST-Dollars/scripts/sync-server.mjs`

**Interfaces:**
- Consumes: `server/`, `shared/`。
- Produces: `SillyTavern/plugins/dollars/`（含 `index.js` `db.js` `package.json` + `shared/protocol.json`）。

- [ ] **Step 1: 写同步脚本**

`ST-Dollars/scripts/sync-server.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// ST-Dollars 在 .../third-party/ST-Dollars，plugins 在 .../SillyTavern/plugins
const dest = path.resolve(root, '../../../../../plugins/dollars');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'shared'), { recursive: true });
for (const f of ['index.js', 'db.js', 'package.json']) {
  fs.copyFileSync(path.join(root, 'server', f), path.join(dest, f));
}
fs.copyFileSync(path.join(root, 'shared', 'protocol.json'), path.join(dest, 'shared', 'protocol.json'));
console.log('[sync-server] 已同步到', dest);
```

- [ ] **Step 2: 运行同步并核对路径**

Run: `cd ST-Dollars && node scripts/sync-server.mjs`
Expected: 打印 `已同步到 .../SillyTavern/plugins/dollars`；`ls SillyTavern/plugins/dollars` 应有 `index.js db.js package.json shared/protocol.json`。
> 若路径不对，调整脚本里 `dest` 的相对层级（以实际打印为准）。

- [ ] **Step 3: 开启 server plugins 并重启 ST（手动）**

- 编辑 `SillyTavern/config.yaml`：`enableServerPlugins: true`
- 重启 ST。控制台应出现：`[Plugin Loader] Loaded plugin: Dollars (dollars)`

- [ ] **Step 4: 手动验收 /health**

Run（在能访问 ST 的机器）: `curl http://127.0.0.1:8000/api/plugins/dollars/health`
Expected: `{"ok":true,"protocolVersion":1,"db":"ok"}`
> 拿到这个 = SQLite 建库读写 + server plugin 加载 + 路由挂载 全部验证通过。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat(m0): sync-server script; backend loads in ST, /health green"
```

---

### Task 4: 前端骨架（Vite + Vue3 + Shadow DOM 空壳 + 魔杖入口）

**Files:**
- Create: `ST-Dollars/vite.config.ts`, `manifest.json`, `scripts/sync-version.mjs`, `src/index.ts`, `src/st/context.ts`, `src/App.vue`, `src/styles.css`

**Interfaces:**
- Consumes: `shared/protocol.json`。
- Produces: `dist/index.js` + `dist/index.css`；面板挂在 Shadow DOM；魔杖菜单出现「Dollars」。

- [ ] **Step 1: vite.config.ts（照柏宝书 resolver）**

```ts
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { defineConfig } from 'vite';

const relSt = path.relative(
  path.join(__dirname, 'dist'),
  __dirname.substring(0, __dirname.lastIndexOf('public') + 'public'.length),
);
const globals: Record<string, string> = { jquery: '$', lodash: '_', toastr: 'toastr' };

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    {
      name: 'sillytavern-resolver',
      enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('@sillytavern/'))
          return { id: path.join(relSt, id.replace('@sillytavern/', '')).replaceAll('\\', '/') + '.js', external: true };
        if (id in globals) return { id, external: true };
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    rollupOptions: { input: 'src/index.ts', output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].[hash].chunk.js', assetFileNames: '[name].[ext]', globals }, external: id => id in globals },
    outDir: 'dist', emptyOutDir: false, sourcemap: mode === 'production' ? true : 'inline', minify: mode === 'production', target: 'esnext',
  },
}));
```

- [ ] **Step 2: manifest.json + sync-version 脚本**

`ST-Dollars/manifest.json`:
```json
{ "display_name": "Dollars", "version": "0.0.1", "author": "", "js": "dist/index.js" }
```

`ST-Dollars/scripts/sync-version.mjs`（把版本号写进 js 的 ?ver=，破缓存，免手动硬刷新）:
```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const mfPath = path.join(root, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
mf.version = ver;
mf.js = `dist/index.js?ver=${ver}`;
fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n');
console.log('[sync-version]', ver);
```

- [ ] **Step 3: st/context.ts**

```ts
export const getContext = () => (globalThis as any).SillyTavern?.getContext?.();
```

- [ ] **Step 4: App.vue（空壳，占位显示，Task 5 填连通状态）**

```vue
<script setup lang="ts">
defineProps<{ status: string }>();
</script>
<template>
  <div class="dollars-root">
    <div class="dollars-title">Dollars</div>
    <div class="dollars-status">{{ status }}</div>
  </div>
</template>
```

- [ ] **Step 5: styles.css**

```css
.dollars-root { position: fixed; right: 16px; bottom: 80px; width: 260px; padding: 14px 16px;
  background: #0d0d0f; color: #e5e7eb; border: 1px solid #26262e; border-radius: 12px; z-index: 10060;
  font-family: system-ui, sans-serif; }
.dollars-title { font-weight: 600; margin-bottom: 6px; }
.dollars-status { font-size: 12px; color: #9ca3af; white-space: pre-wrap; }
```

- [ ] **Step 6: src/index.ts（Shadow DOM 挂载 + 魔杖入口，照柏宝书范式）**

```ts
import { createApp, reactive } from 'vue';
import App from '@/App.vue';
import '@/styles.css';

const HOST_ID = 'dollars-app-host';
const state = reactive({ status: '初始化…' });

function mount() {
  let host = document.getElementById(HOST_ID);
  if (!host) { host = document.createElement('div'); host.id = HOST_ID; document.body.appendChild(host); }
  host.style.setProperty('display', 'contents', 'important');
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.textContent = '';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./index.css', import.meta.url).href;  // dist/index.css 同级
  shadow.appendChild(link);
  const container = document.createElement('div');
  shadow.appendChild(container);
  createApp(App, { get status() { return state.status; } }).mount(container);
}

function injectWand(onClick: () => void) {
  const tryInject = () => {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById('dollars_wand')) return true;
    const item = document.createElement('div');
    item.id = 'dollars_wand';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.innerHTML = '<div class="fa-solid fa-comments extensionsMenuExtensionButton"></div><span>Dollars</span>';
    item.addEventListener('click', onClick);
    menu.appendChild(item);
    return true;
  };
  if (tryInject()) return;
  const obs = new MutationObserver(() => { if (tryInject()) obs.disconnect(); });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 30000);
}

// 导出给 Task 5 用
export const dollarsState = state;

(function whenReady(tries = 0) {
  if ((globalThis as any).SillyTavern?.getContext) {
    mount();
    injectWand(() => { const el = document.getElementById(HOST_ID); if (el) el.style.setProperty('display', el.style.getPropertyValue('display') === 'none' ? 'contents' : 'none', 'important'); });
    console.log('[Dollars] M0 前端已加载');
  } else if (tries < 150) { setTimeout(() => whenReady(tries + 1), 200); }
})();
```

- [ ] **Step 7: 构建 + 手动验收挂载**

Run: `cd ST-Dollars && pnpm install && pnpm build`
Expected: 生成 `dist/index.js` + `dist/index.css`；`manifest.json` 的 `js` 变成 `dist/index.js?ver=0.0.1`。
手动：`Ctrl+Shift+R` 刷新 ST → 控制台见 `[Dollars] M0 前端已加载` → 魔杖菜单出现「Dollars」→ 点击弹出右下角黑色小面板（显示"初始化…"）。

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "feat(m0): frontend shadow-dom shell + wand entry + vite build"
```

---

### Task 5: 前后端连通 + 协议版本校验（端到端手动验收）

**Files:**
- Create: `ST-Dollars/src/transport.ts`
- Modify: `ST-Dollars/src/index.ts`（启动时拉 /health 并更新状态）

**Interfaces:**
- Consumes: `getContext()`（拿 `getRequestHeaders`）、`shared/protocol.json`、`isCompatible`（Task 1 的 `transport.logic.mjs`）。
- Produces: `fetchHealth() -> { ok, protocolVersion, db }`；`describeHealth(clientVer, health) -> string`（可测纯函数）。

- [ ] **Step 1: 写失败测试（状态描述纯函数）**

追加到 `ST-Dollars/src/transport.test.mjs`:
```js
import { describeHealth } from './transport.logic.mjs';
test('后端正常且版本一致 → 全绿', () => {
  assert.match(describeHealth(1, { ok: true, protocolVersion: 1, db: 'ok' }), /连通.*版本 OK.*DB OK/s);
});
test('版本不一致 → 明确提示不兼容', () => {
  assert.match(describeHealth(1, { ok: true, protocolVersion: 2, db: 'ok' }), /版本不兼容/);
});
test('后端不可达 → 明确提示', () => {
  assert.match(describeHealth(1, null), /连不上后端/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test src/transport.test.mjs`
Expected: FAIL（`describeHealth` 未定义）

- [ ] **Step 3: 实现 describeHealth（补进 transport.logic.mjs）**

```js
export function describeHealth(clientVer, health) {
  if (!health || health.ok !== true) return '连不上后端（server plugin 没装 / 没开 enableServerPlugins / 没重启）';
  if (!isCompatible(clientVer, health.protocolVersion)) return `版本不兼容：前端 v${clientVer} / 后端 v${health.protocolVersion}`;
  return `已连通 · 版本 OK (v${clientVer}) · DB ${health.db === 'ok' ? 'OK' : health.db}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test src/transport.test.mjs`
Expected: PASS（全部，含 Task 1 的 3 条）

- [ ] **Step 5: 实现 transport.ts（浏览器侧，包裹纯函数 + 真 fetch）**

```ts
import protocol from '../shared/protocol.json';
import { describeHealth } from './transport.logic.mjs';
import { getContext } from '@/st/context';

export const CLIENT_PROTOCOL = protocol.protocolVersion as number;

export async function fetchHealth(): Promise<any | null> {
  try {
    const headers = getContext()?.getRequestHeaders?.() ?? {};
    const res = await fetch('/api/plugins/dollars/health', { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
export function healthText(health: any | null): string {
  return describeHealth(CLIENT_PROTOCOL, health);
}
```

- [ ] **Step 6: index.ts 启动时拉 /health 更新面板**

在 `index.ts` 的 `whenReady` 成功分支、`mount()` 之后加入：
```ts
import { fetchHealth, healthText } from '@/transport';
// …mount()/injectWand() 之后：
fetchHealth().then(h => { dollarsState.status = healthText(h); });
```

- [ ] **Step 7: 构建 + 端到端手动验收**

Run: `cd ST-Dollars && pnpm build`
手动（后端须已按 Task 3 装好并重启）：`Ctrl+Shift+R` 刷新 ST → 打开 Dollars 面板 → 应显示：
`已连通 · 版本 OK (v1) · DB OK`
反向验证：临时把 `shared/protocol.json` 改成 `2`、`pnpm build`、刷新 → 面板应显示「版本不兼容」；验证完改回 `1`。

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "feat(m0): end-to-end health check + protocol version gate (M0 done)"
```

---

## Self-Review

- **Spec coverage**（对 TECH_DESIGN §1/§2/§4/§7 M0）：Monorepo 结构 ✓(Task1)；后端 server plugin + SQLite ✓(Task2)；同步部署到 plugins/ + 双组件装载 ✓(Task3)；Vite+Vue3+Shadow DOM 前端 + ?ver= 破缓存 ✓(Task4)；前后端连通 + 协议版本校验（不兼容即诊断）✓(Task5)。M0 明确不含：领域数据表、Agent 编排、真实 UI（属 M1+）。
- **Placeholder scan**：无 TBD/TODO；每步含实际代码或实际命令 + 预期输出。
- **Type consistency**：`isCompatible` / `describeHealth` 定义于 `transport.logic.mjs`，Task5 与前端 `transport.ts` 一致引用；`openDb/migrate/metaGet/metaSet` 在 Task2 定义、Task2 index.js 与 Task3 同步一致；`protocolVersion` 单一来源 `shared/protocol.json`，前端 import、后端 fs 读，同名一致。
- **已知务实取舍**：`shared` 用 JSON 单一真相避开 ESM/CJS 互操作；纯逻辑放 `transport.logic.mjs`（node 可测），浏览器副作用留 `transport.ts`；ST 集成（挂载、加载、连通）走手动验收——M0 环境无法自动化。
