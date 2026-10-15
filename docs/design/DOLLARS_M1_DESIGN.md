# Dollars M1 — 初始化闭环 设计 Spec

> **文档身份：M1 Milestone Design Spec**
> 承接 `DOLLARS_V1_TECH_DESIGN.md`（§7 里程碑 M1）与 `DOLLARS_V1_DESIGN.md`（§8.1 初始化）。本文细化 M1 的范围、数据模型、AI 识别流程、前后端契约。
> 领域母版 `DOLLARS_FULL_DESIGN.md` 冻结不改。日期：2026-08-23。

---

## 1. M1 范围（锁定）

**目标**：从当前 ST 卡 + 世界书，用 AI **识别出角色**，建成 Dollars 的一批匿名账号，进一个默认公共房间，预览确认后写入 SQLite。

**做**：Secondary API 配置 + 后端 LLM 调用；读卡 + 世界书；**AI 识别角色**（分类 → 抽取两阶段）；建 Universe / Character / Account / Room / RoomMembership；数量预览；确认 commit。

**不做（留后续里程碑）**：AI 编排房间（M1 只建一个默认「大厅」）、NPC 分层、初始 Event、有个性的匿名网名/头像生成（M1 用占位）、IdentityKnowledge 深化、Primary 生成台词（那是 M2）。

**YAGNI**：M1 唯一的 AI 用途是"识别角色 + 抽 persona"；其余全走最简确定性。

---

## 2. 设计原则（本项目通用，用户 2026-08-23 明确）

- **AI 质量优先于成本**：不为省 token / 省调用次数牺牲识别质量。允许多次调用、并发、多 API。
- **分析与生成/抽取拆开**：分类判断（这条是不是角色）与结构化抽取（角色的 persona）是不同调用、不同 prompt。这为后续 Router(分析) / Character(生成) 的分离立架子。
- **失败即停不诈尸**：任一 AI 步骤失败 → 明确报错停止，不降级、不用残缺结果建库（对齐 V1 §19）。
- **SQLite 是唯一事实源**：预览阶段不落库；仅"确认 commit"后写入。

---

## 3. 整体流程

```
打开 Dollars 面板
  →（首次）填 Secondary API（URL/key/model）→ 存后端
  → 点「初始化」
  → 前端读当前卡（v3 字段 + 内嵌 character_book）+ 绑定世界书 → POST 给后端
  → 后端【阶段A 分类】世界书条目分批喂 Secondary，判类型，捞角色候选
  → 后端【阶段B 抽取】每个候选（并发）喂 Secondary，抽结构化 persona
  → 后端确定性建：每个角色 → Character + 匿名 Account；user → Account；建「大厅」Room；全部 join
  → 返回预览（仅数量 + 非剧透结构，不落库）
  → 用户确认 → POST commit → 写入 SQLite
  → 识别不对 → 重新分析 / 重建（不逐条编辑）
```

---

## 4. 数据模型（M1 落这 5 张表）

逻辑 schema（最终列名由 shared schema + 迁移固化）。全表带 `universe_id`、`created_at`、软删除位预留。

```text
Universe {
  universe_id PK, st_chat_id, schema_version, enabled,
  runtime_state: 'active'|'paused', created_at, updated_at
}
Character {                      // 识别出的角色（皮下真身，不直接暴露给普通 UI）
  character_id PK, universe_id,
  source_type: 'worldbook_entry'|'card'|'user',
  source_ref,                    // 世界书条目 uid / 卡 name / 'user'
  display_name,                  // 角色真名（皮下）
  persona,                       // 抽取的结构化 persona（JSON 文本）
  aliases,                       // 别称/keys（JSON 数组）
  created_at
}
Account {                        // 匿名账号（AI/系统用它认人）
  account_id PK, universe_id,
  owner_character_id?,           // 皮下映射（user 账号为空）
  owner_user_id?,                // user 账号标记
  account_kind: 'character'|'user',
  nickname,                      // M1 占位匿名昵称（非真名，防剧透）
  avatar_color,                  // M1 随机
  created_at
}
Room {
  room_id PK, universe_id, type:'public', name:'大厅',
  lifecycle:'active', created_by_account_id, created_at
}
RoomMembership { id PK, universe_id, room_id, account_id, state:'joined', created_at }
```

**匿名不变量**：真实映射存 `Account.owner_character_id`；**预览接口只返回数量与非剧透结构**，绝不返回该映射（对齐 V1 §8.1、验收不变量 #6/#8）。M1 账号昵称用占位（如 `匿名_` + 短随机），有个性的网名/头像生成留后续。

---

## 5. 素材读取（前端）

前端用 `getContext()` 读，POST 给后端（素材不常驻后端，随初始化请求传入）：
- **角色卡**：`ctx.characters[ctx.characterId]`，取 `data.*`（name/description/personality/scenario/first_mes/mes_example/creator_notes）+ `data.character_book`（内嵌世界书）+ `data.extensions.world`（绑定世界书名）。
- **世界书**：`ctx.loadWorldInfo(name)` 载入绑定世界书，取 `entries`（每条 comment/key/keysecondary/content/constant/position/…）。
- 传后端的载荷：卡字段 + 世界书条目数组（M1 不裁剪丢弃——按原则舍得喂，由后端分批调度）。

---

## 6. AI 角色识别（后端，分两阶段，Secondary API）

**阶段 A — 条目分类（分析）**
- 输入：世界书条目**分批**（每批 N 条，控制单次上下文而非丢信息），附卡字段摘要。
- 任务：对每条判类型 `character | setting | rule | lore | other`，给出角色候选（附该条 uid、疑似角色名、置信度）。
- 输出（zod 校验）：`{ items: [{ uid, type, candidate_name?, confidence }] }`
- 多批结果合并去重 → 角色候选集。

**阶段 B — 角色抽取（并发）**
- 输入：每个角色候选对应的条目全文（+ 相关补充条目，如 `NSFW-伊泽尔` 归并到 `伊泽尔`）。
- 任务：抽结构化 persona。
- 输出（zod 校验）：`{ display_name, aliases[], summary, appearance?, personality?, identity? }`
- **并发**多次调用（每角色一次），失败即停。

**标准卡兼容**：卡字段（description 等）非空时，卡本身作为一个 `source_type='card'` 的角色候选进入阶段 B。

**prompt/schema 定稿**留 writing-plans；本 spec 固定"两阶段 + zod 校验 + 失败即停"的结构。

---

## 7. 建世界（确定性，后端）

阶段 B 产出角色列表后，纯规则建库（预览时在内存，commit 时落库）：
1. 每个角色 → 1 `Character`（存 display_name/persona/aliases/source_ref）+ 1 匿名 `Account`（`account_kind='character'`，占位昵称/随机色，`owner_character_id` 指向该 Character）。
2. 建 1 个 user `Account`（`account_kind='user'`，代表玩家）。
3. 建 1 个 `Room`（type=public，name='大厅'）。
4. 所有 Account → `RoomMembership`（state='joined'）。

---

## 8. 前后端 API（`/api/plugins/dollars/*`）

| 方法/路由 | 作用 | 落库 |
|---|---|---|
| `POST /config/secondary` | 存 Secondary API（url/model + key→ 后端 secret；见 §注） | 是（配置） |
| `GET /config` | 读当前配置状态（不含 key 明文） | — |
| `POST /init/analyze` | 传卡+世界书 → 跑阶段A+B+建世界 → 返回**预览**（数量 + 非剧透结构 + 候选草稿 token） | 否 |
| `POST /init/commit` | 传 analyze 返回的草稿 token → 写入 SQLite | 是 |
| `GET /universe` | 查当前 chat 的 Universe 概况（数量级，不剧透） | — |

- 写操作带 CSRF（`getRequestHeaders()`）。
- **§注 key 存储**：M1 先存后端插件的 SQLite（`config` 表，仅后端可读）；是否改用 ST secret store 留后评估（不影响前端契约）。

---

## 9. Universe 绑定

- `universe_id` 后端生成（uuid）；ST 侧仅存薄绑定：`chatMetadata['dollars'] = { universe_id, schema_version }`（`saveMetadata` 立即落盘）。
- 切换 ST chat（`CHAT_CHANGED`）→ 前端按新 chat 的 `chatMetadata` 决定加载哪个 Universe，或提示"未初始化"。
- 一个 ST chat 只读写自己的 Universe（验收不变量 #1）。

---

## 10. 错误处理

- Secondary 未配置 / 调用失败 / zod 校验失败 → `/init/analyze` 明确返回错误，前端提示，不落库。
- commit 事务化：全部成功或整体回滚。
- 重复 analyze 覆盖上一次草稿；重复 commit 幂等（同草稿 token 只写一次）。

---

## 11. 测试

- **纯逻辑 node 测**：世界书条目合并/去重、建世界规则（角色→账号→membership 计数）、DDL 迁移幂等、预览不含映射字段的断言。
- **AI 步骤**：用真实卡（`恶女重生`，62 条世界书）做集成验收——识别出的角色数/名字是否合理。
- **端到端手动验收**：ST 里配 Secondary API → 初始化 → 看预览数量 → commit → `GET /universe` 核对。

---

## 12. M1 里程碑内 task 概览（writing-plans 细化）

1. 数据模型 DDL + 迁移（5 表）+ repo 读写（TDD）
2. Secondary API 配置：前端设置 UI + 后端 `/config` 存取（key 存后端）
3. 后端 LLM 调用封装（调 Secondary，超时/重试/abort，zod 校验）
4. 素材读取：前端读卡+世界书 → 载荷
5. 阶段 A 条目分类（分批调度 + 合并）
6. 阶段 B 角色抽取（并发）
7. 建世界（确定性）+ `/init/analyze` 预览
8. `/init/commit` 事务写库 + Universe 绑定 chatMetadata
9. 前端初始化 UI（触发 + 预览 + 确认）
10. 端到端验收

---

## 13. 待后续里程碑

房间智能编排、NPC 分层、初始 Event、有个性的匿名 profile（AI 起网名/头像）、IdentityKnowledge、Primary 生成台词（M2 对话闭环）。
