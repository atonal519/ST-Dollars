# Dollars M2-A — 编排后端化 设计 Spec

> **文档身份：M2-A Milestone Design Spec**
> 承接 `DOLLARS_V1_TECH_DESIGN.md`（§7 M2 对话闭环）、`DOLLARS_V1_DESIGN.md`（§13 Conversation Cycle）、灵魂 demo（编排已验证）、M1（账号/persona/房间已就位）。
> M2 拆两批：**M2-A 编排后端化（本文）** + M2-B 聊天室 UI。日期：2026-08-24。

---

## 1. 范围

**目标**：把灵魂 demo 的 Conversation Cycle 平移到后端，读 M1 建好的 SQLite 账号/persona/房间跑一轮编排，消息落库。用脚本自测"大厅角色能真聊起来"。

**做**：Primary API 配置；Message 表 + 落库；`server/cycle.js`（五环编排，Secondary 筛候选/选人/判停 + Primary Intent/台词）；简化上下文（房间最近消息 + persona）；`POST /cycle/run` 触发接口；用户消息 commit 落库。

**不做（留后）**：tier 分精度（M2-A 所有账号平等，见 §6）；Context Pack 完整版（权限隔离/Knowledge/Identity → M4）；Focus Mode/Catch-up/多房间（M4）；join/leave/mention/reply/sticker（M2-A 仅 `text`）；前端聊天室 UI（M2-B）。

**先平等**（用户 2026-08-24 定）：cycle 里所有 `character` 账号平等参与候选筛选，不按 tier 区分精度；tier 字段保留、供后续增强。

---

## 2. 数据模型（新增 Message 表）

M1 的 5 表之外，加 `message`（对齐 V1_DESIGN §4 Message，M2-A 落最小子集）：

```text
Message {
  message_id TEXT PK, universe_id, room_id, sender_account_id,
  type: 'text'（M2-A 仅此）,
  content,
  cycle_id,                         -- 本轮 Conversation Cycle 的 id
  status: 'committed' | 'pending_sync' | 'failed',
  created_at
}
```
- 迁移：`db.js` migrate 增建 `message` 表（`CREATE TABLE IF NOT EXISTS`）。
- repo 增：`insertMessage(db, m)`、`recentMessages(db, roomId, limit)`（按 created_at 升序取最近 N 条，供上下文）、`messagesByRoom` 计数。

---

## 3. API 配置（加 Primary）

- 复用 M1-A 的 config 机制：`config.primary` 存 `_meta`（url/model/key），与 `config.secondary` 并列。
- `config.js` 增 `getPrimary/setPrimary`；`/config/primary` POST、`/config` GET 增 primary 打码。
- 前端设置区（M2-B 或本批顺带）加 Primary 那半——**M2-A 后端先支持**，前端表单 M2-B 补（M2-A 自测可临时用脚本写 config）。

---

## 4. 编排（server/cycle.js，平移 demo 五环）

一轮 `runCycle({db, cfgPrimary, cfgSecondary, universeId, roomId})`：

```
循环（硬上限 ~6）：
  ① Secondary 筛候选：给房间在室 character 账号（account_id + persona summary）+ 最近消息 → 选"可能想说话"的候选
  ② Primary 并发 Intent：每候选（persona + 最近消息）→ {action, reason, topic}
  ③ Secondary 选行动者：从 speak 候选选一个（或无人）
  ④ Primary 台词：被选中者 → 一条消息
  ⑤ insertMessage 落库（cycle_id, sender_account_id, type=text, committed）
  ⑥ Secondary continue/stop
```
- **prompts 平移** demo 的 `agents.js`（filterCandidates/genIntent/pickActor/genMessage/continueOrStop），改为：候选/persona 来自 SQLite（account+character），上下文来自 `recentMessages`，用 account_id 认人（对齐匿名设计）。
- **双 API**：①③⑥ 走 Secondary（`callSecondary`），②④ 走 Primary（新增 `callPrimary`，同 llm.js 直连、带重试/超时）。
- **JSON 解析/重试** 复用 jsonutil + 各环节重试（M1-B1 已有）。
- **失败即停不诈尸**（V1 §19）：Primary 失败停内容、Secondary 失败停状态；已落库消息保留。

---

## 5. 上下文（M2-A 简化版）

每个 Agent 调用的上下文 = **房间信息 + 最近 N 条消息（`recentMessages`，含发送者 account_id + 昵称）+ 该角色 persona（summary）**。
- **不做**权限隔离 / Knowledge / Identity Knowledge / Context Pack 预算（那是 M4 的完整版）。M2-A 所有候选看同样的房间最近消息（简化，先跑通）。
- N 条上限（默认 ~20）防上下文膨胀。

---

## 6. 触发与用户消息

- `POST /cycle/run { universeId, roomId, userMessages? }`：先把 `userMessages`（前端 commit 的用户消息）`insertMessage`（committed），再 `runCycle`，返回本轮新增消息。
- M2-A **脚本自测**：写个 `_cycle_test.mjs`（类似识别自测），读 M1 建好的 universe/大厅 + config，`runCycle`，打印落库的对话。**不依赖前端**。
- pending（用户连发多条暂不给 AI）状态由前端管（M2-B）；M2-A 接口只收"已 commit 的用户消息"。

---

## 7. 错误处理

- Primary/Secondary 未配置 / 调用失败 / 解析失败（重试后）→ `/cycle/run` 明确报错；已落库消息不回滚（已发生即保留，对齐 V1 §6）。
- 一轮允许 0 条消息（`cycle_completed_empty`，无人想说）——不报错。
- 单 Room 状态串行（M2-A 单房间跑，天然串行）。

---

## 8. 测试

- **纯逻辑 node 测**：Message repo（insert/recent）、cycle 的候选/意图解析（复用 demo 的解析测试思路）。
- **脚本集成**：`_cycle_test.mjs` 读真实大厅（恶女 12 账号）跑一轮，看落库对话是否像样（角色用 persona 说话、有来回、有沉默）。
- **prompts 质量**：像识别那样，用真实数据迭代 cycle 的 prompt（我自测）。

---

## 9. M2-A task 概览（writing-plans 细化）

1. Message 表迁移 + repo（insertMessage/recentMessages）— TDD
2. Primary 配置（getPrimary/setPrimary + /config/primary + callPrimary）— TDD
3. cycle.js 五环平移（prompts 用 SQLite 数据 + recentMessages + 落库）
4. /cycle/run 接口 + 用户消息 commit
5. _cycle_test.mjs 脚本自测 + 迭代 cycle prompt

---

## 10. 预留接口（简化不写死，用户 2026-08-24 强调）

M2-A 的每个简化都留扩展点，未来加回只改局部、不动调用方：
- **tier 分精度**：`account.tier`（M1 已加列）**透传进 cycle**（候选/上下文函数接收带 tier 的 account），M2-A 不据它分精度；未来分级只改筛选/上下文逻辑，接口不变。
- **消息类型**：`insertMessage({type})` 参数化，`Message.type` 枚举预留 `sticker/join/leave/mention/reply`；M2-A 只传 `text`，不写死。
- **上下文**：抽独立函数 `buildContext(db, {roomId, accountId, limit})`，M2-A 简化实现（房间最近消息 + persona）；未来 Context Pack 完整版（权限隔离/Knowledge/Identity/预算）**整体替换此函数**，cycle 不改。
- **房间**：`runCycle`/`/cycle/run` 收 `roomId`（不写死大厅），预留多房间 / Focus Mode。
- **编排五环**：`filterCandidates/genIntent/pickActor/genMessage/continueOrStop` 各自独立函数，预留插入 tier 资格判定、Event 触发、Pending Causality 等（M4）。
- **用户消息**：`/cycle/run` 收 `userMessages`；`Message.status` 枚举预留 `pending_trigger`（前端 pending 队列 M2-B 接）。

## 11. 待后续

M2-B 聊天室 UI（进房/气泡/头像/发送/继续）；tier 分精度；Context Pack 完整版（权限/Knowledge/Identity）；Focus Mode/Catch-up/多房间；join/leave/mention/reply/sticker；Event/Knowledge/Pending Causality（M4）。
