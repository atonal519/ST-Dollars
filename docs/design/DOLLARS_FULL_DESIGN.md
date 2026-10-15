# Dollars for SillyTavern — Frozen Ideal Baseline

> **文档状态：Frozen Ideal Baseline（冻结的理想完整版）**  
> **适用范围：Dollars for SillyTavern 的产品、领域模型与系统架构基线**  
> **冻结规则：本文件保留已经确认的理想设计，不因 V1 工期、成本、模型能力或性能压力删减。**  
> 后续 V1 减重必须另建文档（如 `DOLLARS_V1_DESIGN.md` / `V1_REDUCTION.md`），逐项记录“完整版能力、V1 取舍、原因、保留接口和恢复路径”；**不得修改本文件来适配 V1**。

---

## 1. 产品定位

Dollars 是运行在 SillyTavern（ST）之上的、以匿名聊天室为表现形式的独立社交世界模拟插件。它不是主楼聊天的皮肤，不是群聊提示词模板，也不是让多个角色轮流回复的简单编排器。

它要创造的是一个与主楼共用人物和世界背景、但拥有自身房间、账号、消息、事件、知识和时间连续性的 **Dollars Universe**。人物在其中能够形成匿名身份、建立或离开房间、邀请他人、私聊、潜水、误认、掉马、传播信息、保守秘密、主动开启话题，并在用户没有上帝视角的前提下继续作为同一个人存在。

### 1.1 核心体验

- 用户面对的是一个“正在存在”的匿名网络，而非按按钮召唤的一组回复模板。
- 角色只根据自己真正知道的内容行动；数据库真相不等于角色认知，更不等于用户可见信息。
- 角色可以说话，也可以观察、犹豫、忽略、离开或保持沉默。沉默是合法行为。
- 世界允许自由涌现，但台词创造力不能自动篡改世界事实。
- 用户观察到的区域高精度展开，未观察区域保持潜在因果，而不是无成本地全宇宙逐句生成。

### 1.2 设计原则

1. **一个 ST Chat，一个独立 Universe。** 不同 ST Chat 的 Dollars 状态、身份、房间、事件和记忆不得串线。
2. **观察边界优先。** 内部客观状态、角色所知、用户所见是三层不同数据。
3. **因果触发，而非全员轮询。** 所有人理论上能行动，但只有被 Event、Knowledge、Pending Causality、Room Context 或社交关系触及的实体才进入候选计算。
4. **语义决定行为，程序提供护栏。** 对话何时结束、Intent 是否完成由语义判断；硬上限只防失控。
5. **长期保存，按需召回。** 存储层不因上下文预算删除历史；模型只读取经过检索和裁剪的 Context Pack。
6. **已发生即不可悄悄抹除。** 已展示消息视为已经发生；失败通过补同步、回滚衍生状态或明确错误处理。
7. **理想架构不写死实现期限制。** 例如“单 Room 最多 10 人”可以是 V1 的运行限制，但不是领域模型的永久约束。

## 2. Universe 边界与生命周期

每个 ST Chat 绑定一个永久 `universe_id`。ST Chat 是 Universe 的外部叙事来源和绑定锚点，不承担 Dollars 内部状态存储。

```text
ST Chat (1) ───── (1) Dollars Universe
                         ├─ Rooms[]
                         ├─ Characters[]
                         ├─ Accounts[]
                         ├─ NPCs[]
                         ├─ Events[]
                         ├─ Knowledge[]
                         ├─ Messages[]
                         └─ Pending Causalities[]
```

- Universe 随当前 ST Chat 创建、加载、重新分析、重建或回退。
- 切换 ST Chat 必须切换 Universe；不得以角色卡名称等非永久字段错误复用状态。
- Universe 内 Room 数量在理想模型中不设上限。
- 不建立传统全局 online/offline 概念。Account 是否离开某 Room，不代表其下线；它仍可在其他 Room 行动或主动发起 DM。

## 3. 总体工程架构

### 3.1 Monorepo

采用单仓库、双运行组件、共享 Schema、单版本发布：

```text
dollars-st/
├─ extension/       # ST 前端 Extension：UI、Room Focus、展示和用户操作
├─ server/          # ST Server Plugin：API、Agent、状态机、数据库和迁移
├─ shared/          # Schema、类型、常量、协议与校验器
├─ docs/
├─ scripts/
└─ package.json
```

Extension 与 Server Plugin 可以分别安装，但版本必须兼容并由同一仓库统一管理。前端检测不到 Server Plugin 或协议版本不兼容时，应阻止初始化并给出明确诊断，不能进入半工作状态。

### 3.2 SQLite

SQLite 是 Dollars Universe 的权威持久化层。ST Chat 只保存 `universe_id` 等最小绑定信息。

SQLite 保存 Room、Account、Profile History、Membership、Message、Event、Knowledge、Fact、Identity Knowledge、Pending Causality、Summary、Checkpoint、Agent Run、Batch Commit 和 Debug Trace。迁移必须版本化；事务边界必须明确；可备份和恢复。

推荐关键约束：

- 所有领域对象使用不可变 ID；显示名不能作外键。
- 消息、知识、事件都保留来源引用和版本。
- 软删除与分支失效是第一选择；物理清理是后续维护操作。
- 同一处理批次拥有永久 `batch_id` / idempotency key。
- 单 Room 的状态提交严格串行；Agent 计算可并发，Commit 必须确定顺序。

### 3.3 Primary / Secondary 双 API

Dollars 自主管理两套 API 配置，**不继承或复用 ST 主楼 API 配置**。

- **Primary API**：Character / Content Agent。负责角色思考、意图表达和最终消息内容，质量与人物一致性优先。
- **Secondary API**：Router / State Processor。负责读取、检索、分类、Event/Knowledge 提取、事实风险、调度、Commit、Summary、Catch-up 和全局轻量扫描，结构化输出与稳定性优先。

两者均由 Server Plugin 调用，密钥不暴露给前端。二者可以指向相同或不同供应商/模型，但职责不混淆，也不偷偷互相降级。

## 4. 复用 ST-SevenDaysCal（构画）的输入基础设施

Dollars 应将 ST-SevenDaysCal 中成熟的能力抽象为可复用层，而不是重新发明 ST 正文和世界书读取：

- `ST Chat Reader`：读取楼层、swipe/reroll/编辑状态及稳定消息标识。
- `Content Sanitizer`：剥离 thinking、reasoning、widget、HTML/XML 指令块和非叙事噪声；允许 `keepTags` / `extraTags` 保护卡片自定义正文标签。
- `WorldInfo Reader`：遵循 ST 当前激活世界书规则，区分普通 Lore 与插件私有条目。
- `Branch / Reroll Detection`：基于消息/楼组 hash 与版本识别正文变化，使旧摘要和衍生状态可失效。
- `External Story Memory`：复用近期正文、L0、L1 等由近及远、由细到粗的长期记忆结构。

在该基础上，Dollars 增加轻量 Lore Filter / Classifier：保留 Persona、World Fact、Character Knowledge、Conditional Lore；隔离 RP 指令、作者注释、jailbreak、输出格式和纯生成指令。插件专用世界书条目应使用“禁用条目 + 不进入 selected world info”等双重隔离，避免反向污染主楼。

## 5. 双记忆域

### 5.1 External Story Memory（外部主楼记忆）

这是 Dollars 永久可查询的**只读世界历史源**：

- 角色卡与 Persona；
- 当前激活世界书；
- 最近主楼正文；
- 构画 L0/L1 长期摘要；
- 主楼分支、reroll、delete 与来源版本。

外部记忆不整体同步或复制进 Dollars SQLite。Dollars 每次生成或处理状态时按需查询它；主楼新增内容通过 Reader/Sanitizer 增量进入 Event Extractor。

### 5.2 Dollars Internal Memory（内部记忆）

这是 Universe 的独立、可读写运行态：

- Room Messages 与 Room Summary；
- Event、Event Summary 与生命周期；
- Character/Account Knowledge；
- Identity Knowledge；
- Fact/Claim/Proposal 与 Authority；
- Pending Causality；
- Membership、Invitation、Room Access、Profile History；
- NPC 与角色升级状态；
- Checkpoint 和失效链。

两域生成时共同参与检索，但所有权严格独立：

```text
External Story Memory (read-only) ┐
                                  ├─ Router/Retriever ─ Context Pack ─ Content Agent
Dollars Internal Memory (read/write)┘
```

“外部记忆是世界历史，内部记忆是 Dollars 社交历史”。Dollars 内部聊天不写回构画记忆；外部摘要也不复制成另一份内部主楼数据库。

## 6. 两类核心 Agent

### 6.1 Router / State Processor

这是“世界管理器”，可通过不同任务模式工作，而不必物理拆成大量 Agent：

`retrieve / classify / event / commit / summarize / schedule / catch_up / risk_review`

职责包括：

- 从双记忆域、角色卡与世界书筛选上下文；
- 为每个候选角色生成权限隔离的 Context Pack；
- 维护 Event、Knowledge、Fact Authority、Pending Causality；
- 运行全局轻量扫描并确定候选行动者；
- 校验新事实风险和来源合法性；
- 在生成批次后进行幂等状态 Commit；
- 生成 Room/Event Summary；
- 输出可解释的调度和过滤原因。

Router 不替角色写最终台词，也不能把数据库全知直接下放给角色。

### 6.2 Character / Content Agent

这是“内容生成器”。它只根据分配给自己的 Context Pack，以对应 Character 的 Persona、Knowledge、Identity Knowledge、Mental State 和 Intent 思考并发言。

它不直接遍历 SQLite，不读取无权知道的 Room，不自行决定事实已被全世界接受，也不承担全局状态合并。

同一 Cycle 中多个角色的 Intent 可并发计算；消息排序、状态变化和最终 Commit 由调度器串行化。

## 7. Context Pack 与结构化图谱检索

底层使用 SQLite 结构化世界记忆图谱，上层使用 RAG 式按需检索。核心节点包括：

`Universe / Character / Account / Room / Message / Event / Knowledge / Fact / NPC / Summary`

核心边包括：

`owns / knows / believes / participates / member_of / occurred_in / mentions / sourced_from / invited / related_to / caused_by`

检索从“当前 Character + Account + Room + Event”多个中心向外辐射：

```text
Character → Account → Current Room → Recent Messages
    └────→ Knowledge → Related Event → Pending Causality
    └────→ Identity Knowledge
    └────→ Persona / Relevant Lore / External Story Memory
```

Context Pack 至少包含：

- `actor`：Character、Account、当时 Profile、Persona；
- `room`：可见 Room 状态、成员、权限和最近消息；
- `events`：当前相关 Event 与该 Room 接触到的切面；
- `knowledge`：该角色确实拥有、相信程度明确的事实；
- `identity_knowledge`：该观察者对各 Account 的身份认知；
- `pending_causality`：与该角色/房间有关的未决因果；
- `external_story_context`：按需召回的近期正文、L0/L1、Lore；
- `mental_state` / `active_intent`；
- `constraints`：消息类型、事实权限、可执行行为和输出 Schema。

预算优先级：必带 Persona、当前 Room、当前 Event、最近消息；高优先角色 Knowledge、Pending Causality、身份信息；低优先远期 Summary、旧 Event 和其他 Room 关联记录。检索管线未来可从 SQL 关系过滤演进到 FTS、Embedding rerank，而无需推翻数据模型。

## 8. Event、Knowledge、Fact Authority 与 Pending Causality

### 8.1 Event

Event 是跨主楼和多个 Room 的世界事件，不固定绑定单一 Room。`Event ↔ Room` 为多对多，并通过 `RoomEventContext` 保存该房间接触到的事件切面，防止上帝视角。

生命周期复用构画的伏笔系统：

`筹备 → 冲突 → 消散 / 完成`

- **筹备**：事件成形，允许零碎信息、传闻和猜测。
- **冲突**：矛盾爆发，触发权重最高。
- **消散**：未明确解决，但影响淡出。
- **完成**：因果闭合，保留长期可检索记录。

### 8.2 Knowledge

Knowledge 是事实单元及其观察者关系，而非复制整段聊天。至少记录 subject、content、source、source_version、importance、learned_at，以及每个 Character/Observer 的 `knows / believes / confidence`。

信息在 Room 出现不等于所有成员永久获得它。传播以在场、可见、后续翻阅/转述和 Agent 行为为边界；角色在一个 Room 合法获得的信息进入其全局个人记忆，去别的 Room 后仍然知道，但是否说出由 Intent 决定。

### 8.3 Fact Authority

必须区分：

- `world_fact`：已由主楼、权威 Lore 或已确认 Event 支撑；
- `character_claim`：某角色声称为真，但未获得世界事实权限；
- `proposal / rumor / hypothesis`：建议、传闻或猜测；
- `room_observation`：仅在可观察范围内成立的行为。

角色可以说“昨晚我杀了人”，但系统默认只提交为 `A claims X`，不能直接提交为 `World Fact: X`。**台词权不等于世界事实修改权。**

### 8.4 新事实风险评分

Router 对候选新事实评估：设定冲突风险、新实体规模、对他人状态影响、主剧情影响、不可逆程度、来源合法性、角色动机和现有证据。

- 低风险日常细节可自由涌现。
- 中风险内容以 claim/rumor/proposal 存储，等待证实。
- 高风险世界改写必须有 External Story Memory、Event 或显式授权支撑，否则拒绝升级为 world fact。

### 8.5 Pending Causality

未观察区域不必生成逐句消息，但必须能保存“以后需要结算的因果”：触发源、目标 Room/Character、必要前置、可见性、优先级、最早/最晚结算点、状态与来源版本。

它连接主楼 Event、隐藏 Room、角色主动加入、邀请、DM、知识传播和 Catch-up；来源失效时也必须随 checkpoint 回退。

## 9. Lazy Simulation、Focus Mode 与 Room Catch-up

### 9.1 Lazy Simulation

Room 离开后无需持续生成完整逐句聊天。未观察期间主要保存 Event/Knowledge 变化和 Pending Causality。理想架构同时保留未来运行“隐藏 Room 持续实际模拟”乃至“全 Universe 后台模拟”的接口与 `simulation_mode`，但默认调度可以是惰性的。

### 9.2 Focus Mode

用户正在观察的 Room 进入高精度 Focus Mode：角色可实时产生 Message、Join、Leave、Invite、DM、Create Room、Profile Update 等行为。

Focus 中不按定时器凭空无限生成。触发是离散的：进入后的 Catch-up、主楼 Event、用户点击继续、已启动 Cycle 的自然延续、或被当前因果强烈触及的角色行为。

### 9.3 Room Catch-up

再次进入 Room 时，系统从最后观察 checkpoint 到当前 External Story Memory/Universe 状态执行轻量 Catch-up：

1. 收集相关 Event、Knowledge 和 Pending Causality；
2. 判定期间可能发生的入室、退室、邀请、DM、关键交流；
3. 只物化与当前可见体验和后续因果有关的内容；
4. 更新 Summary/Knowledge 后进入 Focus Mode。

“行为能力”和“结算时间”分离：Account 可以是主动加入的，只是无人观察时到 Catch-up 才确定具体发生方式。

### 9.4 全局轻量扫描

每次 Conversation Cycle 都执行当前 Room 高精度演算 + Universe 轻量全局扫描。扫描只判定：是否有人应加入/离开、邀请、创建或切换 Room、发起 DM、带走话题或触发新因果；不展开其他所有 Room 的完整聊天。

## 10. Room 模型与社交行为

### 10.1 Room 类型与容量

- `public`：知道其存在且有访问资格的 Account 可自主加入。
- `private`：需要 Invitation 或其他明确授权。
- `dm`：两个 Account 的永久复用私聊 Room；不重复创建精神分裂式 DM。

完整版支持理论上无限 Room。V1 的单 Room 10 人上限属于实现期性能/交互限制，不写成不可迁移的数据库约束。

### 10.2 创建与生命周期

Room 可由初始化、角色主动行为、Event、用户操作或长期关系形成。每次创建必须有发起者、理由、初始邀请对象和来源，而非“系统凭空生成”。Room 生命周期至少支持 `active / dormant`，默认不自动删除，未来可被再次唤醒。

### 10.3 邀请、进出与主动加入

- Invitation 生命周期：`pending → accepted / rejected`，可扩展过期/撤销。
- 邀请者和被邀请者知道邀请与结果；其他成员不会自动获得心灵感应。
- 接受后成员只看到可观察的“某 Account 进入聊天室”，不自动知道是谁邀请。
- Public Room：已知存在、有资格、有动机即可自主 Join。
- Private Room：必须先获得 Invitation/权限。
- Leave 只代表离开当前 Room，不代表下线。
- 角色可在用户不在场时邀请或主动 DM 用户；主动 DM 至少物化首条消息。

### 10.4 Room 发现与访问

Room 的存在本身属于 Knowledge。用户和角色分别维护：

`UNKNOWN → DISCOVERED → ACCESSIBLE`

访问还可包含 `history_access = none / partial / full` 与 `history_from`。Public 只表示可被发现/可自主进入，不表示所有 Account 天生知道全站目录。Private Room 可被听说但仍不可访问。未知 Room 不应返回给普通 UI。

### 10.5 可见性与通知

未读和通知仅基于用户有访问权的 Room 中实际可见内容。隐藏 Room 即使提到或“@”用户账号，也不能产生上帝视角通知。系统状态变化不等于信息自动广播。

## 11. 身份与账号

### 11.1 永恒 Account ID

每个 Account 使用不可变 `account_id`。昵称、头像、颜色只是可变面具，绝不作为身份主键。AI 和系统用 ID 认人；普通 UI 默认隐藏内部 ID。

### 11.2 Character → Accounts[] 马甲架构

底层必须从第一天支持：

```text
Character A
├─ Account A1
└─ Account A2
```

每个马甲拥有独立 Profile History、Membership、消息和被观察者认知，但共同指向同一 Character。不得用 `UNIQUE(character_id)` 封死未来。一个角色可以双号、自演、伪装；其他观察者可能只识破其中一个账号。

### 11.3 Profile History

Account 可以因身份风险、社交策略、心境或主动行为修改昵称、头像、颜色。历史消息保存**发送当时的 Profile Snapshot**，不能随当前资料穿越改名。

### 11.4 Identity Knowledge 与 Observer

身份真相与身份认知分离：

- 系统保存真实 `Character ↔ Accounts[]`。
- 每个 Observer（用户或 Character）独立维护对每个 Account 的 Identity Knowledge：未知、怀疑、部分确认、确认、误认，以及证据/来源/置信度。
- 用户本身也是 Observer，不自动获得管理员全知。
- 匿名识破、误认、装作不知道、掉马都由聊天证据和角色判断发展，而非昵称字符串匹配。

### 11.5 用户账号

用户 Account 与 AI Account 遵循同样的永久 ID、Profile 和 Room 权限模型；只有控制权不同。普通交互不暴露真实映射，高级身份管理入口必须有匿名剧透警告。

## 12. NPC 模型

NPC 是低成本、可升级的世界参与者，而不是一次性名字。建议优先级：

1. 已有完整 Character；
2. 已存在、与 Event/Room 相关的 NPC；
3. 必要时创建新 NPC。

NPC 可先以轻量 Persona、来源、作用域和少量 Knowledge 存在；当其参与次数、事件重要度、与核心角色联系或用户关注达到阈值时，升级为更完整的持久角色。升级必须保留原 NPC ID、历史消息、Profile 和 Knowledge，避免“换了一个人”。无重要性的新路人应保持轻量，防止角色膨胀。

## 13. 消息、输入与 Conversation Cycle

### 13.1 消息类型

完整版消息模型支持并保留扩展性：

- 文本；
- 系统消息（进入、离开、无人等）；
- Sticker / 表情包；
- `@mention`（结构化 Account 引用）；
- Reply / 引用回复（引用稳定 Message ID 与当时快照）；
- 图片/附件、转发等未来类型。

产品原则为 **无撤回**：一旦 Commit 并展示即视为发生。更正只能通过后续消息，管理/分支回退走 checkpoint 与软删除，不伪装成社交撤回。

### 13.2 Pending User Message

用户点击发送后，消息立即显示并本地持久化为 `pending_trigger`，但在点击“继续”前不进入任何 Agent 认知。用户可连续发送、编辑或删除多条 pending；对 AI 而言它们尚未发生。

点击继续时，这批消息原子地从 pending 变为 committed，并作为同一批用户输入进入 Room Tick。Commit 后不可普通撤回。

### 13.3 Conversation Cycle

“继续”启动一轮自然 Conversation Cycle，而不是只生成下一条：

```text
Commit Pending User Messages (optional)
→ Global Lightweight Scan
→ Candidate / Intent Evaluation
→ Ordered Message & Action Generation
→ Batch State Commit
→ Intent exhaustion / natural silence
→ Dormant
```

无 pending 时仍可点击继续，相当于继续旁观。Cycle 可以生成 0 条消息；`cycle_completed_empty` 必须与 `generation_failed` 严格区分。硬消息上限只防模型失控，不作为正常结束标准。

### 13.4 Intent 生命周期与沉默

Intent 是有生命周期的短期 Mental State，而非每条消息重新抽签：

`speak / observe / hesitate / leave / ignore`

`active_intent` 可以因未完成而延续，urgency 随等待变化；在意图完成、相关新信息、直接互动、@、话题切换、知识版本变化或局势冲突时语义失效并重算。沉默、潜水和犹豫都是有效输出，不是失败。

新话题可来自 Event Pool、角色记忆、最近群聊、已知世界书信息或用户发言。先判断“来源是否合法”，再判断 relevance、novelty、social fit、motivation 和 continuity。小型日常细节可自由，大型世界事实进入风险审查。

## 14. Summary、长期存储、遗忘与召回

原始消息和结构化状态长期保存在 SQLite；上下文长度不随历史线性增长。

- **Room Summary**：该 Room 过去发生过什么，只管社交历史。
- **Event Summary**：该 Event 发展到哪一步，可跨主楼和多个 Room。
- Character 不另存重复大摘要；从 Knowledge 图谱按需召回。

Summary 在 Focus Session 结束或达到消息阈值时更新。生成批次结束后，Secondary API 批量提取 Knowledge/Event/Pending Causality，并在单次事务中 Commit，而非每条都处理或整场结束才处理。

“遗忘”默认是召回衰减，不是物理删除。检索考虑 `importance / recency / relevance / emotional_intensity / access_count`；低优先内容淡出 Context，但仍可因相关事件再次被捞起。未来可加入更精细的记忆巩固、衰减和矛盾修订。

## 15. 主楼变化、Checkpoint 与回退

主楼 reroll、swipe、编辑或删除可能使 Dollars 衍生世界线失效。系统必须沿用构画的内容 hash/分支检测，并建立基于主楼消息 ID 与内部 Commit 的 Checkpoint。

Checkpoint 保存状态引用、版本和提交边界，而非复制整库。建议在以下时机建立：

- 主楼产生影响 Dollars 的新 Event；
- 重要 Conversation Cycle / Batch Commit 完成；
- 重建、重新分析或高风险状态迁移之前。

回退流程：

1. 找到 `source_message_id <= target` 的最后有效 checkpoint；
2. 将其后衍生的 Event、Knowledge、Room State、Message、Summary、Pending Causality 标为 `invalidated_by_branch` / `deleted_at`；
3. 恢复 checkpoint 的有效状态引用；
4. 对新分支重新执行增量分析；
5. UI 中失效内容消失，但底层先软删除以支持恢复与调试。

## 16. 初始化与维护操作

### 16.1 初次初始化

AI 读取角色卡、激活世界书、External Story Memory 与近期正文，自动决定初始 Account、Room、必要 NPC 和初始 Event。用户无需逐个手建。

初始化结果先预览再确认，但匿名规则优先：普通预览只能显示统计与非剧透结构，例如“识别 4 个角色、创建 3 个账号、1 个公共 Room、2 个临时 NPC”，**不得显示 Account ↔ Character 真实映射**。用户可重新生成。真实映射仅在深层高级管理入口中查看，并明确提示匿名身份剧透。

### 16.2 三层维护操作

1. **重新分析**：重新读取角色卡、世界书和主楼，重做初始化判断；不删除已有 Dollars 聊天记录，主要用于纠正识别错误。
2. **重建 Dollars 世界**：保留 ST Chat，清空/失效当前 Universe 的 Room、NPC、Event、Account 映射、Summary 等内部状态，再从外部源初始化；主楼不受影响。
3. **恢复默认**：在重建基础上，同时恢复当前 Chat 的 Dollars 自定义配置默认值。

所有破坏性操作必须先显示影响范围、建立 checkpoint，并明确是否可恢复。

## 17. 主楼回流（未来模式）

Dollars 产生的内容未来如何影响主楼，预留三种模式，不在当前理想架构中强迫选择唯一答案：

- **Isolation**：Dollars 完全独立，内部消息不回流主楼。
- **Memory**：经筛选的 Event/Fact/Knowledge 作为外部记忆供主楼检索，不直接插入正文。
- **Linked**：经用户确认或高置信规则，将选定 Dollars 事件正式链接到主楼时间线。

回流必须保留来源、Fact Authority、可见性和分支版本，不能把未证实角色台词直接写成主楼事实。

## 18. 关系系统边界

Dollars **不管理爱情值、好感度、敌意值等关系数值**。人物关系通过角色卡、世界书、外部关系插件和实际互动表现。Dollars 只保存与社交行为直接相关的结构化事实、Knowledge、Identity Knowledge 和可解释状态。

预留外部关系插件接口：可读关系快照、订阅变化、发送交互事件；但接口缺失时 Dollars 仍能运行，且不得私自维护一套冲突的关系数值真相。

## 19. 失败、并发、事务与幂等

- Primary 失败：当前内容生成停止并明确报错。
- Secondary 失败：状态处理停止并明确报错；不让世界假装正常运行。
- 不自动偷偷切换另一模型生成降级内容。
- 已展示消息永久保留；后处理失败则标记 `pending_sync`，恢复后补处理。
- 未展示队列暂停；重试从最后成功 Commit 开始。
- 同一 Room 严格串行；不同角色的只读 Intent 计算可并发。
- Message/Action/Knowledge/Event 使用有序 Commit，数据库事务保证原子性。
- 每批处理带永久 `batch_id`、输入版本、输出 hash；重复重试不得重复提取知识或创建事件。
- 乐观锁/版本号防止旧 Agent 结果覆盖新 Room State。
- 所有外部调用记录 timeout、retryability、模型、schema_version 和 correlation_id。

## 20. Debug 与可解释性

理想版必须提供分层 Debug，而非只显示“AI 做了决定”：

- Universe/Room 当前版本和最后 checkpoint；
- Cycle 时间线：触发源、候选池、被排除者及原因；
- 每个 Agent Run 使用的 Context Pack 摘要、检索来源和裁剪原因；
- Intent 的创建、延续、完成和失效原因；
- Fact 风险评分、Authority 升降级与证据；
- Knowledge 的来源、传播路径、believes/confidence；
- Pending Causality 的创建、结算、取消和来源失效；
- 批次 Commit、幂等命中、pending_sync、错误与重试；
- 匿名敏感字段在普通日志/UI 中默认脱敏。

支持导出诊断包，但默认不包含 API Key、完整私密消息或匿名真实映射；敏感内容必须由用户显式授权。

## 21. 数据模型最小骨架（非最终 DDL）

```text
Universe
Character ──< Account ──< ProfileHistory
Observer ──< IdentityKnowledge >── Account
Room ──< RoomMembership >── Account
Room ──< UserRoomAccess
Room ──< Invitation
Room ──< Message ──< MessageReference
Event ──< RoomEventContext >── Room
Knowledge ──< CharacterKnowledge >── Character
Fact ──< FactEvidence
PendingCausality
RoomSummary
EventSummary
ConversationCycle ──< AgentRun
CommitBatch
Checkpoint
SourceVersion / Branch
```

所有表必须包含必要的 `universe_id`、稳定 ID、创建/更新时间、source/version、软删除/失效字段和 schema migration 版本。

## 22. 仍待实现阶段验证的事项

以下是**待验证参数或工程选择**，不是对理想能力的删除：

1. SillyTavern 当前 Server Plugin 的实际加载目录、入口格式、权限与 monorepo 双组件安装方案。
2. ST 各版本对 chat ID、message ID、swipe/reroll/edit/delete 事件的稳定性与监听接口。
3. 从 ST-SevenDaysCal 抽取 Reader/Sanitizer/WorldInfo/Branch Detection 的最佳共享方式：内部 package、复制后模块化，或独立公共包。
4. Primary/Secondary 供应商的结构化输出、上下文长度、并发、速率限制、费用和失败行为。
5. Router 与 Content Agent 的准确 Prompt、JSON Schema、校验/修复策略及模型最低能力。
6. Context Pack 的 token 预算、各层配额、召回评分权重、FTS/Embedding 何时值得加入。
7. 新事实风险阈值、Fact Authority 升级规则和不同世界观下的误判率。
8. Lazy Simulation 的默认 `simulation_mode`、隐藏 Room 真实推演的调度与全 Universe 模拟成本。
9. Catch-up 调用次数、最大补全跨度、具体消息物化比例、超时体验和因果一致性。
10. 全局轻量扫描候选池规模、触发频率以及避免漏掉自然入室/DM 的召回率。
11. Conversation Cycle 的自然结束准确度、0 消息 UI、硬上限和用户中途输入时的队列策略。
12. Intent urgency、Pending Topics、Idle Thought Trigger 的真实体验与是否造成无感复杂度。
13. Room 人数、Room 数量、长历史消息量和多 Universe 下 SQLite 的索引与写锁表现；“10 人”只能由实测成为运行默认值。
14. Summary 的触发阈值、事实保真度、矛盾修订和长期召回衰减曲线。
15. NPC 创建/复用/升级阈值与防止角色膨胀的策略。
16. Sticker、Reply、@、图片/附件的具体 ST UI 交互、资源存储和安全边界。
17. Observer Identity Knowledge 的置信度更新、误认、掉马和“装作不知道”的可玩性。
18. Profile/Avatar Pack 的生产与筛选流程，以及动态头像作为未来能力的成本。
19. 主楼分支回退对已展示 Dollars 消息的 UX、checkpoint 密度、软删除保留期和存储膨胀。
20. 重新分析、重建世界、恢复默认的精确清理矩阵及灾难恢复测试。
21. Isolation / Memory / Linked 回流模式的安全确认、冲突解决和用户可理解性。
22. 外部关系插件的发现机制、协议、权限、版本兼容和缺失时行为。
23. Debug Trace 的保留期、性能开销、匿名脱敏、诊断包格式与隐私默认值。
24. 崩溃恢复、重复请求、乱序返回、跨 Room 并发和数据库迁移失败的故障注入测试。

---

## 23. 冻结声明

本文件定义 Dollars for SillyTavern 的 **Frozen Ideal Baseline**：它回答“如果不先受 V1 开发成本约束，Dollars 最合理、完整的形态是什么”。

从此以后：

- 本文件不承担排期、减重或临时妥协记录；
- V1 不实现的能力仍留在本文件中作为架构目标；
- 所有减重决策另建 V1 文档逐项登记；
- 若未来实现恢复被减功能，应回到本文件核对原始边界，而不是从聊天记录重新考古。

**Status: FROZEN — IDEAL BASELINE**
