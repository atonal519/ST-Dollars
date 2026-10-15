# Dollars for SillyTavern — ST 能力侦察报告（Recon）

> **侦察日期：** 2026-08-22
> **侦察对象：** SillyTavern（Luker 分支，`E:/GAME/SillyTavern/Luker`）
> **目的：** 为 `DOLLARS_FULL_DESIGN.md`（Frozen Ideal Baseline）的 V1 减重 / 分步实现提供技术事实依据。
> **对应 frozen 文档第 22 节待验证事项：** 主要覆盖 #1（server plugin 加载/双组件安装）、#2（ST 事件与 message/swipe/reroll 稳定性）、#3（从 SevenDaysCal 抽取 Reader/Sanitizer/WorldInfo/Branch）。
> **引用格式：** 所有 `file:line` 均相对 `E:/GAME/SillyTavern/Luker`，可直接查证。

---

## 0. 一句话结论

Frozen 设计的**地基在当前 ST 上整体可行**：前端扩展 API 面成熟完整、Server Plugin + SQLite 是官方一等公民路径、角色卡 / 世界书 / 聊天读取与独立双 API 全部有现成接口。**没有硬性技术阻断。**

但有**两个需要你在减重时拍板的架构张力**（详见 §5），它们直接决定 V1 的形态和成本：
- **A. 持久化：后端 SQLite vs ST 前端三层持久化**——frozen 要 SQLite，但两个成熟复杂插件都没上后端。
- **B. LLM 调用：自建 server plugin 管 key vs 复用 ST secret store + 代理**——ST 现成机制已经能做到「key 不暴露前端」，削弱了「为藏 key 而上后端」的理由。

---

## 1. 架构可行性：Extension + Server Plugin + SQLite（对应第 22 节 #1）

**结论：可行，且是官方一等公民路径。** 唯一硬前置：用户要在 `config.yaml` 把 `enableServerPlugins` 改为 `true` 并重启（默认关，`config.yaml:180`、读取于 `plugin-loader.js:12`）。

**加载机制：**
- `server-main.js:693` 在 `server.listen` 前 `loadPlugins(app, SERVER_PLUGINS_DIRECTORY)`；核心在 `src/plugin-loader.js`。
- 插件放 `Luker/plugins/<id>/`，入口优先级：`package.json` 的 `main` → `index.js` → `.cjs` → `.mjs`（`plugin-loader.js:648-675`）。
- **模块接口**（`plugin-loader.js:735-787`）：必须导出 `info = {id, name, description}`（三者皆 string）+ `init(router)` 函数；可选 `exit()`（进程退出时调，用来 `db.close()`）。`id` 须匹配 `/^[a-z0-9_-]+$/` 且全局唯一。
- **路由**：加载器自建 `express.Router()` 传给 `init(router)`，仅当 `router.stack.length > 0` 时 `app.use('/api/plugins/<id>', router)`（`plugin-loader.js:770-779`）。

**SQLite（关键利好）：**
- `better-sqlite3` **已在 ST 根依赖**（`package.json:48`，`^12.10.0`，实装 12.10.0）。插件动态 `import` 时 Node 解析裸模块名会走到根 `node_modules`，**可直接 `require('better-sqlite3')` 复用宿主已编译的原生二进制**——不用自带编译工具链、不用担心 ABI。官方文档明确允许（`docs/development/server-plugin.md:405`）。
- CJS 插件必须在自己目录放 `package.json` 声明 `"type":"commonjs"`（根是 `"type":"module"`）；仓库 `plugins/package.json` 已预置为 commonjs。

**前端调用后端：** `fetch('/api/plugins/<id>/...', { method:'POST', headers: getContext().getRequestHeaders(), body })`。POST/PUT/DELETE 必须带 `getRequestHeaders()` 的 `X-CSRF-Token`；GET 只读可免。插件路由挂在全局鉴权中间件之后，**自动继承宿主鉴权**。现成活样板：`ST-BaiBai-Book` 配对的 `baibaoku` 后端（前端传输层 `ST-BaiBai-Book/src/api/baibaoku.ts:9,45-57`）。

**坑：**
- `enableServerPlugins` 默认关——纯前端扩展装完即用，后端要用户多一步配置 + 重启，**首启检测要引导**。
- `enableServerPluginsAutoUpdate` 默认开：若插件目录是 git 仓库，ST 启动会 `git pull`，可能覆盖本地改动——把用户配置 `.gitignore` 或让用户关掉。
- 无沙箱，插件与宿主同进程全权限；分发要强调可信来源。
- 插件路由抛错不被宿主兜底，要自己 try/catch 返回 `{error:...}`。

---

## 2. 读取 ST 素材：角色卡 / 世界书 / 聊天（对应第 22 节 #2、服务第 18 节）

**结论：读取侧被 `getContext()` 完全覆盖，无实质缺口。** 入口统一：`window.SillyTavern.getContext()`（定义在 `public/scripts/st-context.js:2433-2861`）。

**角色卡：**
- 便捷取 persona：`ctx.getCharacterCardFields({chid})` → `{system, mesExamples, description, personality, persona, scenario, jailbreak, charDepthPrompt, creatorNotes, firstMessage, alternateGreetings}`（`script.js:6118-6136`，已解析宏/persona）。
- 原始卡：`ctx.characters[ctx.characterId]`；权威数据在 `character.data.*`（typedef `char-data.js:51-85`），根字段是 back-compat 代理，**写要走 `data.*` / `ctx.writeExtensionField`**。
- 懒加载卡用 `ctx.unshallowCharacter(...)` 强制载入。
- 群聊：`ctx.groups` + `ctx.groupId`，成员是头像文件名数组；`getGroupMembers` **不在 ctx**，需自己映射 `avatar → characters`。

**世界书 / Lorebook：**
- 一步拿到合并后的激活条目：`ctx.worldInfoEntry.getSorted()`（= `getSortedEntries()`，`world-info.js:8679-8733`，合并 global + character + chat + persona 并排序）。
- 分来源：全局 `ctx.chatWorldInfo.globalSelection`；聊天绑定 `ctx.chatWorldInfo.getNames`（读 `chat_metadata['world_info']`）；角色内嵌 `character.data.character_book` + `character.data.extensions.world`，摘要用 `ctx.getCharacterEmbeddedWorld(charId)`。
- 载任意书：`ctx.loadWorldInfo(name)`（返回深拷贝；`.entries` 是**按 uid 索引的对象**，非数组）。
- 运行时条目字段：`world-info.js:7996-8039`（`key[], keysecondary[], content, constant, selective, selectiveLogic, order, position, probability, depth, role, sticky, cooldown, ...`）。`position` 枚举 `world_info_position`（`world-info.js:1694-1703`）。
- **坑**：`getWorldInfoPrompt` / `resolveWorldInfoForMessages` 默认扫描主楼 chat——Dollars 若要对自己的文本做激活扫描，得自己构造 `coreChat` 传进去；否则就 `getSorted()` 拿原始条目自己做筛选。

**聊天消息结构：**
- `ctx.chat`（数组）；`ctx.getMessage/getMessageCount/addMessages/updateMessages/deleteMessages`（`st-context.js:2519-2523`）。
- 用户消息 `{name, is_user:true, is_system:false, send_date, mes, extra:{...}}`（`script.js:9692-9701`）；AI/系统消息含 `swipes[], swipe_id, swipe_info[]`，`extra` 带 api/model/token_count/reasoning。**改正文要同时写 `mes` 和 `swipes[swipe_id]`**，否则正文与 swipe 备份分裂（`ST-BaiBai-Book/src/st/context.ts:208-214`）。

**复用 SevenDaysCal 的输入层（第 22 节 #3）：** SevenDaysCal 已有成熟的 ST Chat Reader / Content Sanitizer / WorldInfo Reader / Branch·Reroll 检测（基于内容 hash）。抽取方式（内部 package / 复制模块化 / 独立公共包）留待实现阶段定，但**能力已存在、路径已验证**。

---

## 3. 独立双 API（服务 frozen §3.3 Primary/Secondary）

**结论：ST 提供了独立于主楼的请求服务和服务端密钥存储，双 API 可落地。** 三条可选路径：

1. **推荐：Connection Manager profiles + `ctx.ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, {stream, signal})`**（`public/scripts/extensions/shared.js:435,466`）。为 Primary/Secondary 各建一个 profile，独立于主楼，支持 chat/text completion 与流式。profile 存于 `ctx.extensionSettings.connectionManager.profiles`。**注意**：connection-manager 被禁用时 `sendRequest` 会抛错（`shared.js:470`）——要么声明依赖它，要么回退到下一条。
2. **自管：`ctx.ChatCompletionService.processRequest({messages, model, chat_completion_source:'custom', custom_url, secret_id, max_tokens, ...}, {presetName}, true, signal)`**（`public/scripts/custom-request.js:428,558`）→ POST `/api/backends/chat-completions/generate`。
3. `ctx.generateRaw / generateRawData`（`script.js:6767,6804`）一次性生成。

**密钥（关键，关系张力 B）：** **没有内联 key 的字段**。key 必须 `writeSecret(key, value, label)` 存进 ST 服务端 secret store，返回一个 `id`（`public/scripts/secrets.js:378`），请求用 `secret_id` 引用。同一 `SECRET_KEYS.*` 下可存多个 key、各有独立 id。→ **即便前端调用，明文 key 也只在 ST 服务端，前端只持有 `secret_id`/`profileId`。** 或用 `reverse_proxy` + `proxy_password`。

**必须自己实现的缺口：**
1. 「Primary/Secondary 两个命名 API 槽」概念 ST 没有——自己在 `extensionSettings` 里持久化哪两个 profileId（或 endpoint/model/secret_id 三元组）是 Primary/Secondary。
2. 自己的双 API 配置 UI（endpoint/key/model/preset 选择器）——ST 给服务和密钥库，但没有现成「双 API 配置」控件。
3. `getGroupMembers` 自己复制。

---

## 4. 工程范式：怎么写这个插件（对应第 22 节 #3）

**结论：直接以 `ST-BaiBai-Book` 为范本，把 `ST-SevenDaysCal` 当「不这么做会怎样」的反面教材。** 两个插件独立收敛到同一批答案，且 SevenDaysCal 明确「借鉴柏宝书」。

**推荐照搬的范式：**
1. **构建**：Vite + TS(+Vue3)，用柏宝书的 `@sillytavern` external-resolver（`vite.config.ts:10-52`）把 ST 核心标 external、不打进包；提交 `dist/`；manifest 的 `js` 带 `?ver=`；`sync-version` 脚本锁版本一致。**不要重蹈 SevenDaysCal 单文件 13,299 行 / 842KB 的覆辙**。
2. **多面板 UI 必用 Shadow DOM**（样式双向隔离，`ST-BaiBai-Book/src/index.ts:54-98`）。三坑：**禁 `<Teleport to="body">`**（内容逃出 shadow 丢样式）、页面组件须单一根节点、`matchMedia` 需 ref+事件桥接。SevenDaysCal 那 242KB 全局 `sp-` 前缀 CSS 就是没隔离的教训。
3. **宿主访问单点**：一个类型化的 `st/context.ts` 封装 `getContext()`；getContext 没暴露的函数用 `/* @vite-ignore */` 动态 import。
4. **持久化三分（最大共识）**：全局配置 → `extension_settings[NS]` + `saveSettingsDebounced`（跨设备同步）；聊天绑定大状态 → `chatMetadata[NS]`，**用 `saveMetadata()` 立即落盘、别用 debounced**（切档时 `clearChat()` 会取消防抖 → 丢数据，`ST-SevenDaysCal/store.js:94-103`）；逐消息 → `message.extra.<ns>_*` + `saveChat`。
5. **上线前必备**：READY 守门（hydrate 前阻断回写，否则默认值覆盖服务器设置，`ST-BaiBai-Book/src/api/settings.ts:562-565`）、防御式 `normalize()/defaults` + 版本迁移、删除白名单 `OWN_KEYS`（绝不动别的插件的 metadata）、多 key 原子写。
6. **提示注入用 `setExtensionPrompt(key, value, IN_CHAT, depth, ...)`**（持久、幂等、按 depth 多 key，`inject.ts:690-693`），别手动 splice chat。需要生成前拦截用 `generate_interceptor`（manifest 声明 + `globalThis.<fn>`）。
7. **异步/生命周期安全**：`CHAT_CHANGED` 做 flush-then-reload；用 task-owner + chatId/chatRevision 守卫防「迟到的异步结果写进新聊天」（SevenDaysCal `runtime/task-owner.js`）；模块注册表统一分发生命周期，别学 `_stListeners` 人肉清单。

**关键事件**（`events.js:3-136`，`ctx.eventSource.on(ctx.eventTypes.X, h)`）：`APP_READY`、`CHAT_CHANGED`（切档核心信号）、`MESSAGE_SENT/RECEIVED`、`CHARACTER_MESSAGE_RENDERED`、`GENERATION_STARTED/ENDED/STOPPED`、`STREAM_TOKEN_RECEIVED`、`MESSAGE_SWIPED/EDITED/DELETED`、`GENERATE_AFTER_COMBINE_PROMPTS`（发请求前改 prompt）。流式路径下 `MESSAGE_RECEIVED` 会多点发射，**处理要幂等**。

**UI 挂载点**：魔杖菜单 `#extensionsMenu` + class `extensionsMenuExtensionButton`（容器可能晚到，用 MutationObserver 兜底）；设置面板 append `.inline-drawer` 到 `#extensions_settings2`；浮动面板 `#movingDivs`；或完全自建 modal/FAB/Shadow DOM。

---

## 5. ⚠️ 需要你拍板的关键决策（喂给减重）

### 决策 A：持久化 —— 后端 SQLite vs ST 前端三层持久化

| | Frozen 设计 | 现实观测 |
|---|---|---|
| 主张 | SQLite 是权威持久化层（§3.2） | 两个成熟复杂插件（柏宝书 28k 行 / 构画 21k 行）**都没上后端**，全用 `extension_settings` + `chatMetadata` + `message.extra` |
| 理由 | 复杂关系图谱、事务、迁移、软删除、checkpoint、batch_id、乐观锁——确实超出 `chatMetadata` 的舒适区 | 装完即用、跨设备同步免费、无需用户开 `enableServerPlugins`、无分发第二组件 |

- **技术上都可行。** Dollars 的数据模型（§21 那张表：Universe/Account/Room/Message/Event/Knowledge/Fact/IdentityKnowledge/PendingCausality/Checkpoint...）**确实是关系型、多表、要事务和迁移的**，这是 frozen 选 SQLite 的正当理由——硬塞进 `chatMetadata` 的一个 JSON blob 会很痛。
- **但代价明确**：用户要手动开后端 + 重启、无沙箱、分发变双组件、autoupdate 的 git pull 坑。
- **减重要定的**：V1 是①直接上 server plugin + SQLite（数据模型本就复杂，晚迁不如早上），还是②V1 先用前端持久化跑通玩法、SQLite 作为 V1.x 迁移目标（保留接口）？——这条我不替你拍，是你减重清单里的核心一项。

### 决策 B：LLM 调用 —— 自建 server plugin 管 key vs 复用 ST 机制

- Frozen §3.3 说「密钥不暴露给前端」，字面读像是要 server plugin 自己管 key 调 LLM。
- **但侦察发现**：ST 的 secret store 已把明文 key 存服务端，前端只持有 `secret_id`/`profileId`，请求经 ST 代理 `/api/backends/chat-completions/generate`。→ **「key 不暴露前端」用 ST 现成机制就能满足**，不必为此自建后端。
- **含义**：如果决策 A 选了「V1 先前端持久化」，那么 LLM 调用也可以纯前端（Connection Manager 双 profile），key 安全性由 ST 保证。server plugin 只在「需要 SQLite / 需要后端做重活（如离线模拟）」时才必需——而这些正是 frozen 里标注「未来/预留」的部分。

---

## 6. 对 frozen 第 22 节待验证事项的覆盖情况

| # | 事项 | 本次侦察结论 |
|---|---|---|
| 1 | Server plugin 加载目录/入口/权限/双组件安装 | ✅ **已验证**，见 §1 |
| 2 | ST 各版本 chat/message id、swipe/reroll/edit/delete 事件稳定性 | 🟡 **部分**：事件枚举齐全（§4）；swipe/reroll/edit/delete 事件都有；分支检测 SevenDaysCal 用内容 hash 方案，可复用 |
| 3 | 从 SevenDaysCal 抽取 Reader/Sanitizer/WorldInfo/Branch 的最佳方式 | ✅ **能力已验证存在**（§2 末）；抽取形态（内部包/复制/公共包）留实现阶段定 |
| 4–24 | 模型结构化输出、Context Pack 预算、风险阈值、Catch-up 参数、SQLite 索引/写锁实测、体验类等 | ⬜ **不在代码侦察范围**，属实现/调优阶段验证 |

---

## 7. 下一步

按约定工作流：**① 侦察（本报告，完成）→ ② 你给「砍的部分」（V1 减重决策）→ ③ 整合本报告 + 你的取舍 → ④ 一起出 V1 框架。**

减重时，§5 的两个决策（持久化 / LLM 调用后端与否）建议优先定，因为它们决定 V1 是「纯前端扩展」还是「前端 + 后端双组件」，进而决定整个 Monorepo 骨架和第一份 spec 的形态。
