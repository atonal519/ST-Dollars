# Dollars for SillyTavern — V1 Design Specification

> **文档身份：V1 Reduction Baseline**  
> 本文是 Frozen Ideal Baseline 的 V1 减重实施规格，可随 V1 开发与 Review 维护。桌面 `DESIGN_BASELINE.md` 是理想完整版母版，继续冻结；本文不得反向覆盖或修改它。

## 0. 状态约定

- **V1 启用**：必须进入主流程并验证。
- **V1 简化**：保留能力，使用本文件规定的低成本规则。
- **仅保留契约**：保留字段、枚举、接口或扩展点；V1 UI 不暴露、主流程不调用。

占位契约不代表功能已经实现。未来恢复应扩展既有契约，避免迁库、改变稳定 ID 或推翻核心实体。

## 1. 减重总原则：砍功能，不砍架构

V1 控制后台模拟、模型调用和状态复杂度，但不能退化为“长得像 Dollars 的多人 AI 聊天框”。所有裁剪遵守：

1. 砍高级运行行为，不删除所属核心实体。
2. 保留未来恢复所需的数据结构、枚举与服务边界。
3. 被裁能力不进入 V1 UI、不参与默认调度、不产生隐性成本。
4. 预留字段可为空或用固定默认值；读取方须兼容未知枚举。
5. 稳定 ID、信息来源、Knowledge 归属和批次幂等性不可牺牲。
6. Retriever、Trigger、Simulation、Backflow 等必须可替换。
7. SQLite 是唯一持久化事实源；Agent 输出经 State Processor 校验、Commit 后才成为结构状态。

> **现在不运行，不等于架构里不存在。**

## 2. 产品与运行边界

- 一个 ST Chat = 一个完全独立的 Dollars Universe。
- ST Chat 只保存 `universe_id/schema_version/enabled` 等薄绑定；完整状态进 SQLite。
- 保留双记忆域：Main/ST 与 Dollars 分离。
- V1 信息流固定为 `Main/ST → Dollars`；Dollars → Main 全部关闭。
- 保留 `backflow_mode = isolation | memory | linked`，V1 固定 `isolation`。
- ST 页面开着且当前 Chat 在推进：Universe 存活。离开 Room、回主楼继续 RP，Universe 仍可提取 Event、更新 Pending Causality。
- 离开/关闭 ST：Universe 暂停；回来从暂停点继续，**不补算离线期间**。

即：`离开 Room ≠ 世界暂停`；`离开 ST = 世界暂停`。

## 3. V1 不可再砍的核心

1. 双记忆域。
2. Router / State Processor + Character / Content Agent。
3. 角色独立 Context Pack。
4. Intent → Message 两段式。
5. Event / Knowledge / Pending Causality。
6. Focus Room + ST 在线期间 Catch-up。
7. 匿名 Account / 最小 Identity Knowledge。
8. 多 Room + DM + Invite + Join/Leave。
9. NPC。
10. SQLite。
11. Primary / Secondary API。
12. Continue Cycle。
13. 主楼触发。
14. reroll / checkpoint 回退。

继续裁剪其中任一项，都必须重新判断产品是否仍然是 Dollars。

## 4. 核心数据契约

以下为逻辑 schema；最终列名由 shared schema 固化。

```text
Universe {
  universe_id, st_chat_id, schema_version, enabled
  runtime_state: active | paused
  trigger_mode: manual | hybrid | auto
  backflow_mode: isolation | memory | linked
  focus_room_id?, last_active_at, checkpoint_id?
}

Character {
  character_id, source_ref, persona_ref
  account_ids[]
}

Account {
  account_id, owner_character_id?, owner_user_id?
  account_kind: user | character | npc
  profile, profile_history[], created_at
}

IdentityKnowledge {
  observer_character_id, account_id
  state: unknown | suspected | known
  asserted_owner_character_id?
  confidence?, evidence_refs[]?, inference_metadata?
}

Room {
  room_id, type: public | private | dm, name
  lifecycle: active | dormant
  simulation_mode: focused | realtime | abstract | dormant
  visibility_state_by_observer
  materialization_status, summary?, created_by_account_id
}

RoomMembership { room_id, account_id, state: not_joined | joined | left }
Invitation { invitation_id, room_id, inviter_account_id, invitee_account_id,
             state: pending | accepted | rejected }

Message {
  message_id, room_id, sender_account_id
  type: text | sticker | join | leave | mention | reply
  content, sticker_id?, sticker_semantic_tag?, profile_snapshot
  cycle_id, status: pending_trigger | committed | pending_sync | failed
}

Event {
  event_id, source_domain: main | dollars, source_refs[], participants[]
  visibility, kind
  lifecycle: preparation | conflict | dissipation | completed
  authority_tier, risk: low | medium | high
  summary?, related_room_ids[]
}

Knowledge {
  knowledge_id, subject_ref, content_ref, holder_character_id, source_ref
  source_type: world_fact | claim | rumor | opinion | suspicion | unknown
  authority_tier, importance, acquired_at
}

PendingCausality {
  pending_id, source_event_id, target_room_id?, target_character_ids[]
  consequence_kind, payload
  status: pending | resolved | superseded
  created_while_online, created_at, resolved_at?
}

NPC {
  npc_id, tier: P0 | P1 | P2 | P3
  persistence: temporary | persistent
  registry_ref?, source_refs[], growth_metadata?
}

Summary { summary_id, kind: room | event | character, target_id,
          content, source_cursor, updated_at }
ProcessingBatch { batch_id, cycle_id, stage, status, retry_count }
Checkpoint { checkpoint_id, universe_id, cycle_id, state_cursor, created_at }
```

### 4.1 Account、Profile 与匿名身份

- `Character != Account`；Agent 依靠稳定 `account_id` 认人。
- V1 强制 `1 Character = 1 Account`、`1 User = 1 Account`；AI/User 均不能建小号。
- 底层必须保留 `Character → Accounts[]`，不得改成不可扩展的一对一。
- AI Profile 在创建时确定昵称、头像、主题色，之后固定；User 可修改自己的 Profile。
- `ProfileHistory`、`profile_update` action 保留；Message 保存发送时 Profile Snapshot。
- Identity Knowledge V1 只启用 `unknown/suspected/known`。置信度、线索积分、多来源证据链、自动推理不实现，但字段/服务接口保留。

### 4.2 Room、发现与成员关系

- Room 类型：`public/private/dm`；两个 Account 永远复用唯一 DM Room。
- 生命周期仅 `active/dormant`；不自动归档、删除或分多级休眠。
- 可见性保留 `UNKNOWN → DISCOVERED → ACCESSIBLE`。
- 不维护 online/offline、作息或睡眠时间，只维护 Join/Leave。
- Public Room 只通过提及、分享、已知信息或邀请发现。热门、推荐、随机发现算法关闭，接口保留。
- Character 可创建 Room、DM、Invite、Join/Leave；不跑独立价值评分 Agent，直接由 Intent 产生。

### 4.3 NPC

- P0–P3 结构保留。
- V1 不做“出现次数 → 自动升级 → 重新塑形”。创建时直接判定 `temporary/persistent`。
- 临时 NPC 不强制进入 Registry；持久 NPC 写入 Registry。
- `growth_metadata` 与升级服务接口保留。

## 5. API、Router 与 Character Agent

### Primary API

负责 Character Intent、Character Message、用户参与后的高保真回应、必要身份语境判断、重要 NPC 首次塑形、必要的 Catch-up 台词物化。Primary 必配。

### Secondary API

负责 Event 提取/合并/去重、Router 候选筛选、Knowledge 提取、Fact/Claim/Rumor 分类、新事实风险、Summary、Pending Causality、状态更新、Continue/Stop。可与 Primary 使用同一服务，但配置独立。

### Router / State Processor

1. 判断参与资格。
2. 为每个候选角色组装独立 Context Pack。
3. 收集 Intent，选择下一行动者。
4. 校验 action 权限、Room 状态与事实权威。
5. 判断 Cycle 继续/停止。
6. 按批次写入 SQLite。

角色 Context Pack 至少包括：Persona、当前 Room、当前 Event、最近消息、该角色 Knowledge、Identity Knowledge、相关 Pending Causality、Membership/Invitation。不同角色不得共享完整 Pack；先按权限过滤，再按最近性、重要度、相关度限额。

### Intent → Message

固定流程：`资格筛选 → 各角色 Intent → 选择行动者 → 生成 Message/Action`。

Intent 至少支持：

```text
speak | observe | hesitate | leave | ignore |
create_room | dm | invite | join
```

沉默、观察、犹豫、退出都是有效结果。Intent 不直接写最终台词；仅被选中的行动者进入 Message 生成。

## 6. 已确认的运行裁剪

### 6.1 Trigger 与话题

- V1 只开放 Manual + Hybrid；纯 Auto 关闭，但 `trigger_mode=auto` 和 Trigger 接口保留。
- Manual 的 N 楼是“检查”，不等于强制聊天。
- Hybrid 每楼轻量提取 Event；重要事件立即调度，小事件累积，到 N 楼综合检查。
- 不实现复杂 Pending Topics、Idle Thought、主动话题价值评分。
- 当前 Conversation Cycle 内角色仍可自然转话题。
- 保留 `initiative/topic_candidate/idle_thought_trigger/topic_value_score` 契约。
- 角色主动行为只由 Conversation Cycle、主楼 Event、Catch-up 等明确触发点产生。

### 6.2 Focus Room、隐藏 Room 与 Catch-up

- 同一时刻只允许一个 Focus Room 做完整 Character Agent 推演。
- 其他 Room 在线期间可积累 Event、Pending Causality、`pending_activity`，但不展开完整对话。
- 未观察/隐藏 Room 不持续生成逐句 Message 历史，可以产生已确定结构事件。
- `abstract` simulation 不实现；保留 `simulation_mode=abstract`、`abstract_events`、模拟接口。
- 隐藏 Room 未来可通过 `materialize(room_id, range)` 物化；V1 Catch-up 只在必要时生成少量可见内容，不伪造完整历史。
- Catch-up 只结算 **ST 在线、用户未观察该 Room 期间** 的变化；离线期间不补算。
- V1 不单独维护复杂 RoomEventContext。通过 `Room Messages + Character Knowledge + Event` 现场检索；Provider 接口保留。

Catch-up 流程：加载未决因果 → 合并直接相关 Event/Knowledge/确定状态 → 判断系统消息/摘要/少量台词 → Commit → 标记 resolved/superseded → 开放输入。

### 6.3 Event、Fact Authority 与风险

- Event 生命周期继续复用 `筹备 → 冲突 → 消散 / 完成`。
- 不做复杂评分公式，只判断相关性、重要性、公开度、隐私度、新鲜度及直接影响。
- Fact Authority 固定三层：`主楼/明确设定 > Dollars 已确认事实 > Character Claim`。
- 新事实风险只分 `low/medium/high`：低风险可落地；中风险一致性检查后落地；高风险只能成为 Claim/Rumor/Proposal，不得写 World Fact。
- 数值风险评分和精细 Authority Policy 接口保留。

### 6.4 Knowledge、遗忘、检索与 Summary

- 不存复杂 `belief/trust/suspicion_score/lie_state`；只存谁接触过什么、来源是什么。Suspicion 可作为信息类型，不是心理数值。
- 遗忘不做衰减公式，只用条数/token 上限、最近性、重要度、相关度；不删除原始事实。
- V1 零向量：`SQLite 关系检索 + 权限过滤 + 条数限制 + Summary`。
- Retriever 保留 `sql/fts/embedding/hybrid/rerank` backend，V1 固定 `sql`。未来向量只找候选 ID，SQLite 仍是事实源。
- 不做 Character Summary；保留 `Summary.kind=character` 和生成器接口。
- Room/Event Summary 仅由“新增消息达到 N 条”或“重要 Event”触发；退出 Room 只检查，不强制总结。
- Knowledge 每个 Conversation Cycle 结束后由 Secondary 批量 Commit；自定义 commit policy 仅占位。

### 6.5 Sticker、Profile、Debug 与配置

- Sticker 只用许可证明确的开源包和简单标签，如 `happy/angry/awkward/laugh/question`；Agent 返回 `sticker_id` 或标签。不做视觉理解或运行时生图。
- AI Profile 固定，User 可改；ProfileHistory/profile_update 保留。
- Debug 只保留结构化日志、Cycle/Batch ID、失败阶段和重试信息，不做可视化面板。
- 初始化预览只显示 Character/Account/Room/NPC 数量摘要，不做复杂编辑器；错误则重新分析/重建。
- 高级身份管理入口隐藏/开发者化，带身份剧透提示；底层映射可修正。
- Context 条数、Retriever 参数、温度细分、权重、硬上限等用合理默认值，不在普通 UI 暴露。
- 不做关系数值；只留互动 Event、稳定 ID 与 `RelationshipEventSink` 外部插件接口。

## 7. Continue Cycle 与回退

- “发送”与“触发 AI”分离。User Message 先显示并写 DB 为 `pending_trigger`，Agent 暂不可见。
- 用户可连续发送多条；点击“继续”才批量 Commit 到 Context。
- 无 pending 消息也可继续，表示允许当前 Room 自主发展一次。

完整 Cycle：

1. 建立 checkpoint 与 `cycle_id`。
2. Commit 用户 pending 消息。
3. Secondary 提取/合并 Event，更新 Pending Causality。
4. Router 生成候选并建立各自独立 Context Pack。
5. Primary 并发生成短 Intent。
6. Secondary 选择下一位或判定无人行动。
7. Primary 为被选中者生成 Message/Action。
8. State Processor 校验权限、事实风险和冲突。
9. 写入输出并判断 Continue/Stop；继续则重复候选/Intent。
10. 结束时批量 Commit Knowledge/Event/状态，按条件更新 Summary。
11. 完成并推进 checkpoint。

一轮允许 0 条 AI Message，必须区分：

`cycle_completed / cycle_completed_empty / generation_failed / state_sync_failed`。

reroll 只能回到明确 checkpoint，并一致处理 Message、Event、Knowledge、Pending Causality 与队列游标。已确认的更早状态不得误删；可用新版本 supersede。Primary 失败停止内容生成；Secondary 失败停止状态处理，已展示 Message 标 `pending_sync`，以永久 `batch_id` 幂等重试。禁止“诈尸式”降级生成。

## 8. V1 完整运行链路

### 8.1 初始化闭环

读取角色卡、世界书、已有主楼正文 → 建 Universe/Character/单 Account/初始 Room/NPC/Event/Knowledge → 写最小 Identity Knowledge → 显示数量摘要 → 用户确认 Commit。错误使用重新分析或重建 Universe；不提供复杂逐项编辑器。

### 8.2 主楼推进闭环

ST 在线、用户继续主楼 RP → Hybrid 提取 Event → 应用 Authority/风险 → 合并 Event → 找到受影响角色/Room → 对非 Focus Room 写 Pending Causality/pending_activity。此处不运行 Idle Thought、作息、纯 Auto 巡逻或多 Room 并行对话。

### 8.3 进入 Room 闭环

校验可见性/Invitation/Membership → 设为唯一 Focus Room → 加载在线期间未决因果 → 用 Event/Knowledge/Room Message/Summary Catch-up → 必要时少量 materialize → Commit → 开放输入。

### 8.4 对话闭环

用户连续发送 → 点击 Continue → checkpoint → Router 分角色 Context → Intent → 选中行动者 → Message/Action → 校验/Commit → Continue/Stop → Cycle 批量 Knowledge Commit → 条件式 Summary。

### 8.5 社交网络增长闭环

Character Intent 产生 create_room/dm/invite/join/leave → Router 校验 Account、可见性、Invitation、唯一 DM 约束 → State Processor 写 Room/Invitation/Membership → 非 Focus 新 Room 只接收结构变化和 Pending Causality。不运行额外建群价值评分 Agent。

### 8.6 暂停恢复闭环

离开 ST → Universe paused，保存最新成功批次/checkpoint → 暂停期间零 Trigger/Agent/Event/Catch-up → 回来恢复最后成功状态 → 不补算离线期间。

### 8.7 失败闭环

Primary 失败停内容；Secondary 失败停状态；已展示消息保留为 pending_sync；原 batch_id 幂等重试；reroll 从 checkpoint 一致恢复。

## 9. 未来恢复接口表

| 被裁/简化能力 | V1 行为 | 保留契约 | 恢复方式 |
|---|---|---|---|
| 隐藏 Room 实时模拟 | 只存因果/待活动 | `simulation_mode`、`HiddenRoomSimulator` | 后台调度后启用 realtime |
| 多 Account/马甲 | 每角色/用户一个 | `account_ids[]`、`create_account` | 放开配额/UI |
| 复杂身份推理 | 三态 | confidence/evidence、`IdentityInferenceService` | 加证据累计/自动迁移 |
| abstract simulation | 不实现 | abstract 枚举、`abstract_events`、Simulator | 生成结构事件 |
| 心理/关系状态 | 不存数值 | `MentalStateProvider` | 外部插件接入 |
| 复杂遗忘 | 简单排序限额 | `MemoryRankingPolicy`、decay 参数 | 替换排序策略 |
| Character Summary | 不生成 | kind=character、Generator | 开启生成器/触发器 |
| 纯 Auto | 关闭 | trigger_mode=auto、Scheduler | 加预算控制后开放 |
| Pending Topics | 当前 Cycle 自然转题 | initiative/topic_candidate/value score | 跨 Cycle 队列 |
| Idle Thought | 不运行 | trigger/provider | 安全调度后启用 |
| 作息/Presence | 仅 Join/Leave | Presence/Schedule Provider | 接外部数据源 |
| Room 推荐/热门/随机 | 关闭 | Discovery Provider 三类方法 | 加隐私过滤后启用 |
| AI Profile 动态更新 | 固定 | ProfileHistory、profile_update | 开放 AI action |
| NPC 自动成长 | 创建时临时/持久 | P0–P3、growth metadata、Promotion Service | 按事件升级 |
| 数值事实风险 | 三档 | `FactRiskScorer`、score/explanations | 引入评分模型 |
| 复杂 Summary 触发 | N 条/重要 Event | `SummaryTriggerPolicy` | 增加累计/退出条件 |
| 可配置 Knowledge Commit | 每 Cycle | commit policy | 开放条数/时间策略 |
| 复杂 Room 生命周期 | active/dormant | Lifecycle Service、可扩枚举 | 加归档/休眠等级 |
| 复杂 Event 评分 | 少量判断 | `EventScoringPolicy` | 迁入成熟权重规则 |
| Offline Simulation | 离 ST 暂停 | Offline Provider、运行游标 | 后台服务后启用 |
| 多 Focus 并行 | 一个 Focus | `FocusScheduler` | 加并发隔离/冲突解决 |
| 隐藏 Room 完整历史 | 不物化 | status、`materialize()` | 按需补历史 |
| 精细 Fact Authority | 三层 | `FactAuthorityPolicy`、metadata | 加来源权重 |
| 向量/Embedding | SQLite SQL | Retriever backends | 新 backend 返回候选 ID |
| Dollars → Main | 关闭 | 三种 backflow mode、Adapter | 用户显式开启 |
| RoomEventContext | 现场组合 | Provider | 跨大量 Room 时持久化 |
| 建房/DM/Invite 价值评分 | Intent 直接产生 | RoomActionPolicy/scorer | 需要时插入评分器 |
| 复杂 Sticker | 开源包+标签 | StickerProvider/tags | 加视觉匹配器 |
| 可视化 Debug | 仅日志 | 结构化事件流 | 面板消费日志 |
| 初始化编辑器 | 数量摘要 | InitializationDraft | 增加逐项审阅 UI |
| 高级身份管理页 | 开发者入口 | IdentityAdminService | 防剧透 UI 后公开 |
| 复杂配置项 | 默认值 | versioned config schema | 验证后逐项开放 |
| 关系数值 | 不做 | RelationshipEventSink | 独立插件维护 |

占位接口未安装实现时必须返回 `unsupported_in_v1` 或固定默认行为，不得静默制造状态。

## 10. V1 验收不变量

1. 一个 ST Chat 只读写自己的 Universe。
2. Dollars 事实不自动写回主楼。
3. 同时最多一个 Focus Room 高精度生成。
4. 非 Focus/隐藏 Room 不持续生成完整 Message 历史。
5. ST 离线期间零调度、零补算。
6. 每个角色 Context Pack 独立过滤；不能泄漏别人的 Knowledge。
7. Intent 与 Message 分离，允许 0 发言 Cycle。
8. V1 UI 不能创建第二 Account，但 schema 支持 Accounts[]。
9. Identity Knowledge 只有三态参与业务判断。
10. 高风险新事实不能直接成为 World Fact。
11. Knowledge 每 Cycle 批量 Commit，失败可幂等重试。
12. Summary 只生成 Room/Event，只由 N 条或重要 Event 触发。
13. Retriever 不依赖向量服务。
14. reroll 后 Message/Event/Knowledge/Pending Causality 一致。
15. 被裁能力有契约占位，但不会被 V1 主流程误启用。

## 11. 维护规则与冻结结论

- 本文件是 **V1 Reduction Baseline**，后续用版本号和变更记录维护。
- Frozen Ideal Baseline 永远独立冻结，不因 V1 取舍修改。
- 新增 V1 功能应注明是“从理想版恢复”还是“新产品决策”。
- 恢复裁剪功能时先更新恢复接口表，再更新运行链路与验收不变量。
- 实现与本文冲突时先做设计 Review，不让隐性实现成为事实标准。

V1 的冻结形态是：

> 一个依附于当前 SillyTavern Chat、只在 ST 在线期间存活，以单 Focus Room 高精度生成、以 Event/Knowledge/Pending Causality 维持其余世界连续性，并通过匿名 Account、角色独立 Context 与 Intent → Message 保留社交自主性的 Dollars Universe。
