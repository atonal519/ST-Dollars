# Dollars for SillyTavern — V1 技术顶层设计

> **文档身份：V1 Technical Top-Level Design**
> 承接 `DOLLARS_FULL_DESIGN.md`（Frozen 理想版母版）、`DOLLARS_V1_DESIGN.md`（V1 减重规格）、`DOLLARS_ST_RECON.md`（ST 能力侦察）与灵魂切片 demo（编排可实施性已验证）。
> **本文回答"怎么建"**：仓库组织、技术栈、模块结构、前后端契约、数据模型骨架、里程碑。
> **本文不覆盖**：产品/领域规则（见 V1_DESIGN）、逐字段 DDL 与逐条 API（留各里程碑的实现 spec）。
> 日期：2026-08-22。

---

## 0. 决策摘要（本轮已拍板）

1. **独立 Monorepo 仓库**，仓库根直接放在 `SillyTavern/public/scripts/extensions/third-party/ST-Dollars/`——前端为主体、原地开发、走 ST 标准 git 安装分发。
2. **后端是仓库内的 `server/` 子目录**，通过同步脚本部署到 `SillyTavern/plugins/dollars/`（ST 硬规矩：server plugin 必须在 `plugins/`）。
3. **技术栈**：pnpm workspace + Vite + TypeScript + Vue3 + Shadow DOM（前端）；Express router + `better-sqlite3`（后端）；`zod`（shared 校验）。
4. **灵魂 demo 是抛弃型原型**，代码不复用，但其已验证的编排逻辑（prompts / Intent schema / Cycle 循环 / continueOrStop 要点）作为资产平移。
5. **接受双组件安装成本**：最终用户装两个组件 + 开 `enableServerPlugins` + 重启。用户已确认可接受。

---

## 1. 仓库与部署架构

### 1.1 目录布局

```
third-party/ST-Dollars/          ← git 仓库根 = 前端扩展本体（ST 直接 clone 到此）
├─ manifest.json                 ← ST 读这个来加载前端
├─ dist/                         ← 前端构建产物（提交，带 ?ver= 破缓存）
├─ src/                          ← 前端源码（Vue3 + Shadow DOM）
├─ shared/                       ← 前后端共享：schema、类型、常量、协议、错误码
├─ server/                       ← 后端源码 → 同步到 SillyTavern/plugins/dollars/
├─ scripts/                      ← 部署/同步/构建脚本
├─ docs/                         ← 设计文档（本文与后续 spec 归档于此）
├─ package.json                  ← pnpm workspace 根
├─ vite.config.ts
└─ tsconfig.json
```

- ST 把 `third-party/ST-Dollars/` 当**前端扩展**加载（读根 `manifest.json` + `dist/`）。
- `server/` 对 ST 前端不可见，由脚本同步到 `plugins/dollars/`，由 ST 的 server plugin 加载器加载。
- `shared/` 同时被前端与后端引用（workspace 内），构建时分别打进各自产物。

### 1.2 部署与开发流

- **前端**：仓库原地就是加载位置，`pnpm dev`（Vite watch）构建到 `dist/`，改完刷新即见；`dist/` 带 `?ver=` 由构建注入，避免手动硬刷新。
- **后端**：`pnpm sync:server`（或 watch）把 `server/` 产物同步到 `SillyTavern/plugins/dollars/`。Windows 下**优先 copy/watch**（symlink 需开发者模式，作为可选加速）。改后端需重启 ST 生效（server plugin 只在启动时加载）。
- ST 仓库 `.gitignore` 已忽略 `third-party/*` 与 `/plugins/*`，两处互不污染 ST 仓库。

### 1.3 分发（最终用户）

1. 前端：在 ST「安装扩展」贴仓库 git URL → clone 到 `third-party/`。
2. 后端：装 `dollars` server plugin（ST 管理入口或手动放 `plugins/`）。
3. 在 `config.yaml` 开 `enableServerPlugins: true` → 重启 ST。
4. 首启前端做**健康检查**：探测后端存在性 + 协议版本兼容；不满足则阻止初始化并给明确诊断（对齐 FULL_DESIGN §3.1，不进半工作状态）。

---

## 2. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 包管理 | pnpm workspace | 与柏宝书一致；workspace 串联 shared/前端/后端 |
| 前端构建 | Vite + TypeScript | ST 核心标 external 不打包（照柏宝书 vite.config 的 resolver）；`dist` 带 `?ver=` |
| 前端 UI | Vue3 + Shadow DOM | 多面板复杂 UI；Shadow DOM 双向样式隔离（避开 Teleport/单根/matchMedia 三坑） |
| 宿主访问 | `st/context.ts` 单点封装 `getContext()` | getContext 未暴露的函数用 `/* @vite-ignore */` 动态 import |
| 后端 | Express router（ST 提供）+ Node | `init(router)` 注册 `/api/plugins/dollars/*` 路由 |
| 持久化 | `node:sqlite`（Node 内置） | M0 实测 `better-sqlite3` 无预编译二进制；改用 Node ≥22.5 内置 SQLite（`DatabaseSync`），免原生依赖/免编译，同步 API 适合严格串行提交 |
| 校验 | `zod`（在 shared） | 模型输出、前后端消息统一校验，接住"模型偶尔乱吐" |

---

## 3. Monorepo 内部结构

### 3.1 前端 `src/`（extension）

```
src/
├─ index.ts            # 入口：等 ST 就绪、挂 Shadow DOM host、注入魔杖入口、健康检查
├─ st/                 # 宿主桥
│  ├─ context.ts       # getContext() 类型化单点封装
│  ├─ reader.ts        # 读 ST 角色卡/世界书/正文（复用 SevenDaysCal 的 Reader/Sanitizer 思路）
│  └─ events.ts        # 订阅 CHAT_CHANGED / MESSAGE_* 等，做幂等 + 生命周期守卫
├─ transport/          # 调后端：fetch /api/plugins/dollars/*（带 CSRF）、错误映射、协议版本校验
├─ ui/                 # Vue3 + Shadow DOM
│  ├─ App.vue / host.ts
│  ├─ pages/           # 房间列表 / Room Focus / 初始化预览 / 设置（双 API 配置）/ Debug
│  └─ components/      # 气泡、双色头像、消息类型渲染等复用件
└─ state/              # 前端 UI 态（当前 Room、pending 用户消息等）
```

### 3.2 后端 `server/`

```
server/
├─ index.(c)js         # 入口：导出 info{id,name,description} + init(router)（+ exit 关 DB）
├─ db/
│  ├─ connection       # better-sqlite3 连接（DB 落 plugins/dollars 目录，绝对路径）
│  └─ migrations/      # 版本化迁移
├─ repo/               # 各实体读写（Universe/Account/Room/Message/Event/Knowledge/…）
├─ agents/             # ← demo 资产平移
│  ├─ router           # 资格筛选 / 选行动者 / continue-stop（Secondary）
│  ├─ character        # Intent / Message（Primary）
│  ├─ prompts          # 各环节 prompt（含 continueOrStop 多人语境要点）
│  └─ schema           # zod：Intent / 候选 / 决策 输出校验
├─ cycle/              # Conversation Cycle 编排（串行、batch、checkpoint）
├─ api/                # 路由：init / continue / room / message / config / debug …
├─ llm/                # 双 API 调用（Primary/Secondary），key 存后端，超时+退避+abort
└─ state/              # 状态机、commit、batch_id 幂等、pending_sync 重试
```

### 3.3 `shared/`

zod schema + 由 zod 推导的 TS 类型 + 常量枚举（Room/Message/Intent/Authority…）+ 前后端消息协议 + 协议版本号 + 错误码。**一处定义，前后端共用**。

---

## 4. 运行时架构与前后端契约

### 4.1 数据流

```
ST 前端 (extension)
  │  ① 只读 ST 素材：getContext() 读角色卡/世界书/正文（RECON §2）
  │  ② 操作 → fetch /api/plugins/dollars/*（带 getRequestHeaders() 的 CSRF）
  ▼
server plugin (Node)
  │  Router/Character 编排 → 读写 SQLite（唯一事实源）
  │  调 Primary/Secondary 双 API（key 在后端，不进前端）
  ▼
结果 JSON → 前端渲染
```

### 4.2 关键契约决策

- **ST 素材由前端读取后传给后端**（不让后端自己去解析 ST 的 data 文件）。理由：角色卡/世界书/正文读取是 ST **前端** getContext() 的能力，格式官方保证；"当前选中哪个角色/chat"这一状态也在前端。后端保持自给自足于 Dollars 自己的 SQLite，只在初始化/Catch-up 时接收前端喂来的素材快照。
- **API 形态**：`/api/plugins/dollars/<资源或动作>`；写操作（POST/PUT/DELETE）必带 CSRF 头，只读 GET 可免。
- **协议版本**：每个响应带 `schema_version`；前端 transport 层校验，不兼容即阻止初始化并诊断。
- **错误**：后端自行 try/catch 返回 `{ error, code }`（ST 不兜底插件路由错误）；Primary 失败停内容、Secondary 失败停状态处理，均明确报错，不"诈尸降级"（对齐 V1 §7、§19）。

---

## 5. 数据模型（SQLite 骨架）

以 V1_DESIGN §4 的逻辑实体为准，落成 SQLite 表族（**逐字段 DDL 留 M1 实现 spec**）。核心表：

`Universe / Character / Account / ProfileHistory / IdentityKnowledge / Room / RoomMembership / Invitation / Message / Event / Knowledge / PendingCausality / NPC / Summary / ProcessingBatch / Checkpoint`

**全表通用列约定**（对齐 V1 §4、§19）：
- 不可变主键（`*_id`），显示名**不得**作外键；所有业务表带 `universe_id`。
- 来源与版本：`source_ref` / `source_version` 保留；软删除/失效 `deleted_at` / `invalidated_by_branch`。
- 批次幂等：写操作归属永久 `batch_id`；`schema_version` 供迁移。
- 单 Room 状态提交严格串行；Agent 计算可并发，Commit 顺序确定。

---

## 6. 从 demo 平移的已验证资产

- **五段编排**：`筛候选 → 并发 Intent → 选行动者 → 生成台词 → continue/stop` → 落到 `server/cycle/` + `server/agents/`。
- **Intent schema**：`speak/observe/hesitate/leave/ignore`（V1 再加 `create_room/dm/invite/join`）→ `shared` 的 zod。
- **健壮 JSON 解析** + **失败即停不降级** 的原则保留。
- **关键要点**：`continueOrStop` 的 prompt 必须点明"多人聊天室、角色可互相接话、别每次回应用户就停"，并把"本轮还想说但没轮到的人"喂给它（demo 实证：不这么做会退化成一人独白）。

---

## 7. V1 里程碑（实现路线，每个里程碑各出实现 spec + plan）

- **M0 地基骨架**：Monorepo + 部署脚本 + 前端空壳面板 + 后端 `init` hello 路由 + SQLite 建库/连通/一张表读写。→ **等于把 RECON 里"没实跑过"的地基一次性验证掉**。
- **M1 初始化闭环**（V1 §8.1）：前端读 ST 素材 → 后端建 Universe/Character/单 Account/初始 Room/NPC → 数量摘要预览 → 确认 Commit。
- **M2 对话闭环**（V1 §8.4）：Conversation Cycle 平移到后端 + SQLite 落库 + 前端渲染（Dollars UI）。
- **M3 社交增长**（V1 §8.5）：`create_room/dm/invite/join/leave` + Membership/Invitation。
- **M4 世界连续性**（V1 §8.2/§8.3）：Event/Knowledge/PendingCausality 提取 + Focus Room + 在线期 Catch-up。
- **M5 收尾**：Summary、reroll/checkpoint 回退、失败/pending_sync、Debug 日志、暂停恢复。

M0 先行，既是骨架又是地基验证。

---

## 8. 待后续 spec 细化（不在本文定稿）

- 逐字段 SQLite DDL 与索引（M1 spec）。
- 完整 API 列表与请求/响应 schema（各里程碑 spec）。
- Router/Character 各环节 prompt 与 zod schema 定稿、Context Pack token 预算与配额。
- **初始化 Prompt 边界**（FULL §18 遗留）：角色卡/世界书里 Persona / World Fact / Character Knowledge / Conditional Lore vs RP 指令 / 作者注 / jailbreak / 输出格式的解析与隔离。
- 双 API 配置的存储位置（后端 SQLite vs ST secret store）与 UI。

---

## 9. 风险与开放问题

1. **地基实跑**：数据库改用 `node:sqlite`（M0 已验证命令行 Node v24 可用）；待验 **ST server plugin 运行时 Node 版本 ≥ 22.5**（Task 3 装载时确认）。`better-sqlite3` 因无预编译二进制弃用。
2. **素材传输体积**：前端把世界书/正文喂给后端，大 lorebook 下的传输与裁剪策略（初期靠条数/token 上限）。
3. **模型稳定性**：推理模型输出被 zod 接住的成功率（demo 初步 OK，需更多模型覆盖）。
4. **双组件版本一致性**：前端/后端版本漂移 → 靠协议版本校验 + 同仓库统一发布兜住。

---

## 10. 下一步

本文经用户 review 通过后，进入 **writing-plans**：先出 **M0 地基骨架**的实现计划（Monorepo 初始化 + 部署脚本 + 前后端最小连通 + SQLite），据此开搭。
