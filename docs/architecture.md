# 百面相架构与当前本地实现

当前前端为App → FourSenses（视/听/嗅/味）与常驻SettingsPage，共用发展动作及固定底部器官Tab。人物目录、事务与情绪消费同一WorldSnapshot；视页显示简短身份与局部图，不设人物档案入口，听页从WorldSnapshot只读投影的developmentOnstagePersonIds排除参与者非空且全部明确在场的卡片，混合、空或未知参与者保留；visibleHearingActivities与FourSenses图中可跳转事务共用原活动可见规则，原world保持全量。听页按事务仅显示一段主正文，有最新有效自创进展便显示进展，无则显示概况。QQJ原资料、性格/关系分类依据及回忆读取保留，不再生成只供档案详情展示的profileDetails副本。局部图仅用有效明确关系及分型事务/圈层。设置草稿、Shadow DOM、输入隔离及窗口几何保留。

`simulation/atmosphere.ts`生成并接纳情绪局部风向（界面味），`simulation/development.ts`读取已保存风向，生成并接纳听觉人物事务、经历和知情。`application/development.ts`复用people-world同一世界/忙碌/仓储，同批只准备一次QQJ关联材料，圈/关系、个人长期职责、未完事务及持续后果共同进入原最多4合并主题与40k预算；查询先保短名称/角色，再分配长详情，正式事实与正文不因此截断，完整世界参考在基础构筑或旧基础确有缺口时读取，正常味同答补齐后沿用精简基础，每模块派发前读最新主配置。味CAS保存持续圈层背景、有限配方及同答有据静态基础补充，不推进处理位置、在场或时钟；听觉从实际ACK读取风向，保存成功才推进正文处理位置及首次自动许可。候选保存失败不重发本模块，风向重存后继续尚未派发的听觉；已保存情绪后的失败/停止只在下次明确操作时续听觉。续接仅保留当前内存批次，没有自动重试或持久恢复。N只存宿主设置`developmentEveryReplies`，累计由成功位置后的正式AI正文派生。`host/story-completion.ts`只接CHARACTER_MESSAGE_RENDERED一个入口，history reader恢复QQJ隐藏原角色并排除当前流式未完成楼；没有定时器或任务登记。

`simulation/world-construction.ts`以完整许可卡书、精简目录与稳定正文做一次基础请求，在同world保存人物/稳定社交群及明确关系，复用当前活动、局部情绪和展示接纳，并保留经历、知情及人工记录。基线窗口标`purpose:baseline`，`worldBaseline`只记本次起点与首次current待流转标记，不存第二份世界。构建不推进`processedThroughSeq`且保留原`automaticDevelopmentEnabled`；直接构建与构建重存均结束本次操作，不触发after-save追加味听。手动重整独立于增量游标，重读许可卡书并重审自动基础。初始读取从稳定当前资料取材，已处理楼标参考，不据旧正文回改当前事务/在场；构筑与手动首次听共用已有当前钟/端点，处理位置及首次位置单调。手动首次流转读取基线S而非旧P→S；已启用且有基础的自动路径按成功游标处理真实新楼，不因`needsCurrentDevelopment`重复旧基线。历史覆盖不把基线当已发展区间，过去投影严格取所选窗之前的保存链，当前概况不会回灌旧窗或同S旧current窗。

`ui/DevelopmentControls.vue`在原世界观标题与按钮之间，根据当前配置、读取状态、已保存启用标记和DevelopmentView派生绿/橙状态文字。保存候选、失败、停止及重读沿原生命周期呈现，没有独立健康状态、定时器或请求；构筑保存中停止后保留实际已保存结果并提示手动继续。

新任务只resolve实际主模型，沿既有正式client/P代号/65536输出机制。前置QQJ资料是本地批量读取，人物只提供必要字段与短底账，事实事件按关联闭包提供一份；不依赖QQJ异步摘要追平。事件按序仅采用显式变化，段末活动checkpoint独立且仅实际变化者更新；人工保护、已知/报告知情、明确正文校准和原revision保存保留。

旧历史服务源码继续保留，当前不暴露其旧UI；共用接纳不再将段末概况自动合入事件。以下旧普通plan/advance说明仅为保留实现，当前主页的新发展不调用双模型路径。主楼回流尚未接通。

开发入口见 [agent.md](../agent.md)，产品目标与待办见[产品设计](design.md)。本文件描述 `0.1.0-alpha.59` 本地源码，实际安装状态依清单；实际安装版本与资源以[安装清单](/home/admin/sillytavern/data/codex-private/baimian-trajectory-20261021/latest-deployment.json)为准，当前授权、待办及验收状态以[私有 memory](/home/admin/sillytavern/data/codex-private/baimian-trajectory-20261021/memory.md)为准。历史幕后仍为一次整批生成与一次整批 CAS，旧普通推进保留真实补读依赖。语义步骤、故事窗口、解析与保存边界不自动对应独立 API。

## 模块与权威来源

`diagnostics/development.ts` 在 `diagnostics-development/recent` 独立记录正常App挂载/监听、同次触发及跳过、实际模型派发与脱敏原答、解码/应用、真实存储HTTP与回包revision是否存在、页面发布结果。情绪与事务使用同批关联的独立记录，各保留一份原答，其他阶段只存计数和明确引用；不复制输入/世界/QQJ档案。12次操作/24小时事件驱动裁剪，原答单份256KiB/总计512KiB、文档640KiB；裁减带标记。异步微任务合并并复用一次加载的有界文档，只保留在途写与最新待写；失败不等待业务、不重试。白鳥原ACK与仓储本地fallback、发布状态及后台真实world核验是不同事实，诊断不更改保存合同或额外回读世界。

表内模块路径相对 `src/`。

| 模块 | 职责 |
| --- | --- |
| `domain/world.ts`、`world-state.ts` | 人物世界合同与百面相拥有的持久状态；展示人物由外部目录派生，不存档案副本 |
| `sources/qqj-people.ts`、`qqj-context.ts` | 只读 QQJ 正式公共桥，按明确人物 ID 读取目录与资料 |
| `host/host-context.ts` | 集中兼容 SillyTavern 与 Luker 上下文 |
| `host/story-input.ts`、`story-history.ts`、`story-text.ts` | 正式正文入口、历史范围与 assistant 正文清洗 |
| `simulation/person-context.ts` | 从同一世界快照派生每人事项、参与经历、明确知情和持续后果，不另存缓存或档案 |
| `simulation/atmosphere.ts`、`creative-frame.ts`、`development.ts` | 情绪成品、可复现有限配方及听觉实际发展；风向范围与新增断言/知情分开，依据被校准推翻时整条失效 |
| `simulation/prompts.ts`、`parse.ts`、`advance.ts` | 当前计划/落实编排、正式回答解析与活动/事件/知情结果合并 |
| `simulation/trajectory.ts`、`trajectory-batch.ts` | 历史整批提示/解析、本地时间承接、临时过去投影，不写仓储 |
| `simulation/calibration.ts`、`fact-sources.ts`、`domain/world-facts.ts` | 正文依据资格、明确校准、客观有效性及知情分类 |
| `history/batches.ts`、`collect.ts`、`merge.ts` | 正文事实批次、未确认候选与可核对事实合并 |
| `models/config.ts`、`client.ts`、`person-references.ts` | 配置权威读取、宿主模型请求、按明确引用字段编码/恢复人物代号 |
| `host/api-pool.ts`、`plugin-settings.ts`、`appearance-settings.ts` | 共享池适配及百面相自有启用/主题偏好，写入保留其它字段 |
| `storage/bainiao-client.ts`、`world-repository.ts` | 白鸟 records 与版本 CAS，读写单条百面相世界记录 |
| `application/people-world.ts`、`trajectory.ts` | 同一控制器装配业务、保存确认与界面派生；无第二任务系统 |
| `graph/*`、`ui/*` | 从同一快照投影当前活动、图谱、概况、完整阅读、设置与接续页 |
| `index.ts`、`App.vue`、`ui/PanelShell.vue` | 宿主菜单、ShadowRoot、窗口与单控制器装配；窗口外无暗幕 |

QQJ 拥有人物目录、原始状态、记忆和档案。百面相只保存 `st-dollars / npc-world-{QQJChatId} / world` 中的活动、事件、知情、故事时间、处理位置及覆盖范围。人物 ID 包含 QQJ 聊天身份和实体 ID，不按显示名合并；目录 `selected` 或是否建档不影响资格。

API 独立配置或共享预设引用保存在白鸟 `st-dollars / settings / api`。共享池为 `schedule-planner.apiPresets`，读取按 ID 解析连接；只在用户明确更新、另存或删除时写池，保留其它条目及无关字段，不复制共享 Key。主题和启用偏好在 `extensionSettings['st-dollars']`；只读不写默认值，关闭仍可浏览，禁止新推进、历史检查、整理和确认保存。

`host/general-settings.ts`把QQJ原生设置视图接到同一`schedule-planner`权威；包裹符清洗和世界书名称枚举直接移植原模块，排除在内容读取前消费。`shared-processing-prompt.js`在前端正常初始化时仅填缺失键，保留显式空串；最终文字transport每次读取并注入，不冻结在准备快照。`ui/qqj/*`保留原DOM/草稿/取消/保存及更新检查逻辑，API继续原Vue组件，外观为百面相独有。

## 保留业务调用路径（当前前端不暴露）

以下是 alpha28 交付快照；旧测试对两次请求的期待和这些调用边界均可随获准的业务修正更新。

- **普通启动/推进**：固定本次业务目标、目录、世界和正文。先一次全目录 QQJ 一般资料读取，副模型返回个人行动打算或等待；按问题和明确人物再读取 focused 资料，主模型落实有行动的批次。全部等待时仅第一请求。一般资料与 focused 资料按人物 ID 合并，空或 partial 不抹掉可用内容；计划 DTO 不持久化，短进展不覆盖旧活动概况。
- **正文事实整理**：扣除已覆盖区间，内部自动分批；一次读取本任务 QQJ 辅助资料，每批一次主模型请求。成功候选和下一批位置留在当前未确认任务，失败不自动重试，手动继续不重发成功批；全部完成后明确确认，一次 CAS 合并。当前 QQJ 仅辅助理解，不成为过去状态的证明。
- **历史幕后补写**：本地检查所选起止楼；用户直接开始后，一次主模型请求提供正式正文、完整已整理事实及来源性质、目录和当前作者约束。目录同时提供已加载 SourcePerson.description，不额外读取资料；它是当前作者参考，不作为过去身份、状态或知情的直接证明。一次回答包含 initialBasis、有据边界、有序 segments、校准和新结果。程序按顺序恢复全批 local key、逐段本地接纳后整批一次 CAS；不另发准备/plan/advance，不读取当前 QQJ 状态冒充过去。已覆盖范围可以明确重补，selected明确rework、待补区间/旧窗及首要求边界；旧覆盖不代表已有完整生活。保留原记录，旧窗复用身份且不重复覆盖；选到旧窗内部时沿原窗 ID 保存局部结果，不扩大所选正文或改旧范围。
- **新旧结果**：usedFactIds 仅为依据，newEvents 为新增经历；已有事件 ID 不复制成新事件，重复知情不算新增。新知情可引用旧事件或本批前段事件，取得知情的窗独立于事件发生窗。已知边界 ID 在历史 batch 中按保存链确认先后，无需重复声明；新边界仍须明确文字、来源与连接。明确把旧窗 ID 延长到其保存范围外的行在整体解析前排除，连同该行校准和当前更新一并不应用；合法前后段保留，缺段仍在 remainingRanges，不推断新的尾窗。完整文字与来源楼均唯一相同的旧边界可恢复其ID；事件时间接受{text}，当前更新接受明确平铺字段。模型明确平静可合法完成；实际校准及持续后果变化亦可接纳，不强制新事件。

所有模型入口共用按次请求代理：每次派发前重新读取同一 `ConfigService` 及共享引用，已发请求不换配置。`signal` 在读取设置前后检查；`onStarted` 在实际派发时触发计次和进度，不进入模型 JSON。配置读取失败或派发前停止不计次，已发失败计次。client 通过宿主 chat-completions 路由请求百面相指定连接，URL 使用 QQJ 规范化规则；不读主聊天模型替代百面相设置。模型列表与连接测试仅在用户点击时用编辑草稿发起。

正文事实分批内部默认 24,000 正文字符。历史整批没有 48k 运输包或 24k 整包门槛；batch 请求单独使用 65,536 输出参数，依据当前已知 Gemini 3.8 Flash 官方规格，不代表所有 OpenAI 兼容模型、私有 alias 或代理都接受。普通任务输出参数保持原值。显式 finish_reason=length 报告结果不完整，不把残缺输出当覆盖完成，不自动追加请求。真实渠道容量与语义效果仍待实测。

普通当前资料读取继续一般/聚焦 16,000/40,000 字符及 QQJ 正式单次读取上限100人；历史不套用这项当前资料接口门槛。这些是接口参数，不是用户预算选择。

## 解析、过去状态与保存

模型负责时间、行动、冲突和知情语义。程序提取正式回答，兼容明确包装、别名及非关键缺省；通过人物代号与明确临时 key 恢复归属，不替换自由文本或按姓名、标题猜测。保存活动/事件身份来自权威记录，不能以过去投影中没有该状态为由否认其身份。新活动本批 id/key 明确映射到同一正式 ID；未知显式旧事件 ID 不当作新事件猜测。保留有效部分，只拒绝无法确认关键归属或可靠保存的部分。

过去投影以 `initialBasis` 加明确窗口链中的此前结果生成；事件的 `activityChange` 承接过去变化，已纠正事件不作客观依据。当前 QQJ、旧当前活动概况及未来事实不能复制成过去状态。无历史指针的旧当前活动不被中间历史窗覆盖，最后到当前只按明确 `currentActivityUpdates` 合拢；有据历史变化仍保存在原事件，真实旧活动不会另克隆一份。

历史批次一次提供所选原文；来源楼与实际原文分开。校准可引用本次实际提供的合格 history-floor 事实，新增纠正事实须有原文；旧 scope:seq 生成记录不提供新的正文裁决资格。人工内容优先，旧说法与报告经历保留，纠正不会自动赋予人物正确答案。

过去投影按旧窗位置种入有据 checkpoint，再承接该窗事件变化；旧窗追加的变化能进入后窗。既有当前活动概况仅在所选结束确实达到当前边界时按明确 currentActivityUpdates/当前校准更新，本批最后段不自动等于当前。新过去活动在本批后段承接；人物知情按自身取得来源窗进入过去。

当前页保留 checked 基线及整批候选。实际只返回尾段时保存可接链的有效结果，remainingRanges只扣实际接纳范围；缺首要求段则不采用该答的initialBasis，只承接已有可证过去投影/未知。ACK后更新基线与原版本，保持checked并显示待补楼范围，用户点继续才再一次请求。范围按旧窗through跨度核对，锚点来源楼不是尾段覆盖；无目标交集的重复尾段在校准/事件应用前略过，整答没有目标结果则不保存。普通保存失败以同一候选、原 revision 显式重新保存，无模型调用；真实409禁止将旧候选换新 revision 覆盖，提供重新读取检查。网络未知先读实际版本；原版本未变才可重存。局部 AbortController 结束明确停止的模型头/body 等待；保存不传 Signal，已发保存等 ACK，成功或失败均如实显示。无 timeout、自动失败重试、后台任务登记或跨页恢复。

## 历史展示实现与保留宿主约定

接续管理 `HistoryIntake.vue` 直接隐藏来源、内部列表和长技术说明，只保留必要输入、开始/保存等操作、一句原因及三项请求次数。`request-counts.ts` 根据实际派发数、批次或实际整批派发状态派生预计总数/当前/剩余，不解析 message 猜进度。数目未知如实显示，保存等待与模型等待区分；内部阶段不构成用户必须阅读的技术流程。

当前一层图使用原生SVG连线及Smile节点，支持全部明确邻居与全部当前事务/圈层入口；上下级等有向边保持原方向，节点标邻人的相对角色。旧Cytoscape页不在当前入口挂载。Smile/Plasma来自固定commit的avatar-generator（MIT），Health Icons Outline为CC0；最少源码、本地SVG及许可证随包提供。

API 组件和局部样式直接移植 QQJ：角色选择为上下布局，文档流 listbox、模型列表与 prompt/confirm 沿源正常交互。`appearance.ts` 同次读取宿主信号，派生整体语义变量与 QQJ API 的 auto/day/night 源色板，复用既有监听。外观移植不另造配置业务。

原生 ST 读取 `ctx.chat` 当前 swipe，Luker 读取正式 `readPluginFloors()` cooked 正文。assistant 只删除完整配对 DRAFT，唯一闭合 content 才作为正式正文，保留明确时间参考；user 原文不清洗。历史额外纳入同 QQJ scope 自动隐藏旧楼，排除真正系统楼及其它 scope 的隐藏记录。界面楼号0-based，内部 `seq`、来源、模型引用、处理位置和覆盖范围1-based，仅输入/展示换算，不迁移存档。

旧记录处理位置已超出稳定当前正文时，初始重整从当前稳定资料取参考，保已有钟/锚/事务与在场，不回退游标或重演历史。两模块成功后同楼无新正文不再请求。普通新正文按原游标读取，听觉同答给有据 `windowEnd` 判断流逝，无可信起点保持当前瞬时窗。明确公历中文日期时分会归一化并保留分钟精度；其他历法保持未知。粗作息可有依据暂定，新增精确临时安排必须引用本批合格正式正文sourceSeqs，参考钟点不作安排事实。

## 交付边界

alpha28 本地候选完成离线生产路径/模拟宿主验证，未完成真实模型效果或安卓验收。历史已合并，普通推进是否可合并仍须面对实际资料依赖；公告、自动推进、主楼回流、角色卡/世界书供料未接通。旧部署目录的匿名聊天室、独立后端、SQLite 及其历史测试不是新版运行架构，相关证据由私有记忆路由保留。

### 可丢弃的展示提示

QQJ公共profile仍是唯一档案权威。SourcePerson从同次已读profile提供personality/conduct/expression等性格字段及identityRelations原文；情绪请求只询问尚无有效提示的字段。同答可选presentationUpdates与风向visual经正式人物引用codec、解析、原world CAS及投影承接。temperament六类，visual仅temperature/rhythm两维；坏可选项不拖业务。程序按提供原文的owner及相关字段盖basisKey，源改变/清空后不投影旧提示，下一次正常情绪调用可补，不从浏览触发调用。关系不是第二数据库；没有有效提取时只显示未整理状态。听觉语义输入剔visual，presentation不回灌剧情。

头像颜色与表情随机流独立，按人物ID稳定；圈纹按圈ID及两维分类静态生成，组件只在实际输入变化时绘制，不存PNG或跨聊天图片缓存。内部olfaction名称保留，界面味=情绪、嗅=公开信息，未新增公开信息调用。

## 世界底账与关联记忆（alpha45）

同一NpcWorldState.foundation保存少量人物语义块、来源、稳定群成员区间与明确关系。统一目录贯穿refresh/publish/正常推演，自有人物不向QQJ伪造身份；外部材料仅读明确绑定子集。构筑读取全部许可启用条目及条件，不限constant或均摊截断，也不等QQJ全记忆就绪。已有完整且实际整理过许可参考的短基础后，普通味听不重新载整书；稀疏或旧plugin-only基础在原味请求内补读卡书。味先接纳静态基础再解析同答圈层引用，ACK后批名单与派生角色重基，听只承接短基础和已存背景。

构筑返回漏写全部行级来源字段时，baseline窗口的referenceSources保存本次实际提供的参考集合，各基础项以construction-reference引用该窗口；它记录本次取材，不能充当某行来自特定书条目的证明。显式来源仍核到实际输入，普通推进仍按明确事实维护。已知人物代号误置key在构筑与味的静态foundation中复用已给ID，未知key仍是新人物；QQJ非空人工决定保持优先，空字段允许独立许可书补充，旧QQJ简介不回灌。静态补充沿用同一referenceSources窗口合同，显式空/坏来源仍局部拒收。

首次缺底账的普通batch为construction→ACK→atmosphere→ACK→development，主动构筑仅1次、之后正常推进2次。现有candidate支持同页停止/重存，不增加跨刷新恢复。请求子图保未完事务、持续后果、每人近期种子和明确前序/因果/纠正闭包及全部关联知情，实际sourceContract/authorFacts同集合；apply与保存始终完整authority。当前群/关系不倒灌历史窗口，旧成员区间和结束关系仍留记录。QQJ字段使用统一必要白名单，档案栏目裁剪不清洗真实剧情。

味的basisMaterialRefs可引用实际输入的有效foundation人物/群/关系，以及同答真正接纳的局部key；基础条目的basisEventIds一并承接，原事件被纠正后背景整体失效。群体范围不等于成员当前心情或知情，在场新增具体断言仍沿既有边界。省略更新保同一背景，不随每楼消失。

`simulation/social-context.ts`只从有效未结束的基础群/关系派生取材单位，排已退群成员及依据已被纠正的项。味专用`atmosphereContext`以background（圈、基础、旧底色和已有材料）为主体，changes保完整正文、来源合同、时间与在场归属；顶层轻people供统一P编码。听仍用developmentContext，味不运输routines/restHint/calibration编排合同。

请求记忆保每人近期4项无有效事件的完成checkpoint及少量无主体完成，按已存窗口顺序承接；当前待办personContexts仍仅未完。完整authority保留全部活动。听列表不再过滤completed，最新进展仍按同activityId的有效自创事件判定，不把正文/人工记录冒充自创。粗作息单个数字pair仅机械归一为原嵌套数组，门控规则不变。既有诊断允许foundationRejections，正常前端可区分静态补充与风向拒收。

局部图按真实person.id聚合唯一节点，完整不同关系保留在派生relations；邻居沿纵向椭圆弧排开，中心人物居中；SVG沿头像中心方向直射，并在整节点外缘留断口，保姓名关系可读，不用排位或共用箭头表达上下级。味返回background/change两个瞬态分段，各自校验来源与显式断言，合并已接纳文字/依据成原一条DevelopmentAtmosphere，仍沿事件纠正整体失效；旧flat保持接纳。已知受正文保护活动的精确无变更旧引用不计新工作，场外合法截止checkpoint优先权保持。明确sourceSeqs数字字符串在共享JSON返回解析处机械归一，下游楼号资格校验保持。

味的foundation接纳先处理人物key，再编码一次并重建统一边界供群/关系共用；静态资料/有效旧事件归纳、本行明确正式正文、事件支持的动态社会变化分别沿原来源合同。无新增断言的已知背景可含在场成员，显式stage仍核有效；非空/坏断言不由书源或事件继承chat绕过。两阶段边界拒收复用现诊断；听同答event-key→foundation路径保持，无新存储/调用。

静态新卡沿QQJ公开桥确已ready的聊天身份透传scope，人物目录尚idle不丢该身份。无稳定正文的StoryInput仍null/[]；构筑window/foundation/baseline数值0仅表示未处理正文，sourceSeqs为空，processed/storyTime仍null；首流转不以baseline0限制未来正文。无身份或实际资料则等待不发模型。重复结束同一群/关系保最初endedWindowId，旧投影不因再次重整改变。

`domain/social-circles.ts`共享有效社交对象、精确归属和纯派生圈卡；foundationReferences移至现world-foundation域并保原simulation出口。Taste/FourSenses/图入口/focusMood共用foundation G/R稳定key，群必成卡、关系仅已绑定风向成卡；卡名/成员由foundation决定，同圈正文去重全保。boundAtmospheres只归一主体/群标题，保原personIds供听与life-materials；旧unbound仅在味输入保留修正，不全局删除。显式circleRef未知拒相关row，缺省只从已接纳段唯一G/R恢复；background可据已知circle，change先过自身来源再附circle依赖。该主体basisEventIds沿原纠正整体失效合同，不新增圈库存储/调用/状态。听body末标点只在selector显示派生，canonical activity/event不变。

模型返回的同类正式旧ID误放在key时，统一按旧身份接纳并保留本答引用；显式id优先，冲突引用拒收，其他新key继续新建。构筑、味、听、共享校准和原历史消费者复用同一机械归一，不以名称或参与者推断身份；原来源、人工和阶段归属校验继续在各消费者执行。

味简介由MoodOverview按真实DOM自然排版判断是否超过两行；只有有效折叠才输出按钮、ARIA收展状态与三角。等宽测量不含三角留白，继承同一字体与折行，隐藏测量盒不进入可访问文本或增大滚动范围。局部ResizeObserver与内容更新跟随宽度、字体/字号及正文变化，组件卸载断开，不增加业务状态、持久副本或全局轮询。
