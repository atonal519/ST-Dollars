# 百面相架构

## 模块边界

- `src/domain/world.ts` 定义派生展示使用的人物、活动、事件、知情和剧情时间；`src/domain/world-state.ts` 定义百面相真正拥有并持久化的状态。外部人物资料不会写入本域记录。
- `src/sources/qqj-people.ts` 与 `src/sources/qqj-context.ts` 只读千千结正式公共桥。稳定人物 ID 含 QQJ 聊天身份和实体 ID；资料按明确 `personId` 归属。
- `src/host/story-input.ts` 读取宿主正文；`src/host/story-text.ts` 只清洗 assistant 楼：删除完整 DRAFT 配对、仅在唯一闭合 content 结构时取其正式正文，并保留明确的时间参考。Luker 使用正式 `readPluginFloors()` cooked 内容；原生 SillyTavern 使用当前 `ctx.chat` 选中 swipe。楼序只作处理进度，不推算故事时间；user 楼保持原文。
- `src/simulation/prompts.ts`、`parse.ts`、`advance.ts` 负责短提示、宽容结构解析和计划/批量推演。正常选择到保存有两次模型请求、两次批量资料读取；空选择只有一次模型请求。模块不保存存储、不更新 UI。
- `src/models/client.ts` 经宿主现有 chat-completions 路由发起 Primary/Secondary 请求，并在生成请求时按千千结 URL 规则规范化地址；`src/models/config.ts` 保留 Dollars 自有设置及掩码 Key 语义。独立配置仍由 Dollars 持有；共享池路由仅在白鸟 `settings/api` 中保存预设 ID，每次获取模型配置都从 `schedule-planner.apiPresets` 现读连接字段。
- `src/host/api-pool.ts` 只读共享 API 池；`src/host/appearance-settings.ts` 只读写 Dollars 自己的宿主主题偏好。两者都经 `src/host/host-context.ts` 兼容 SillyTavern 与 Luker。
- `src/ui/appearance.ts` 解析千千结同款 auto/day/night 颜色规则、应用百面相语义变量并管理宿主主题变化监听；`src/ui/AppearanceSettings.vue` 提供设置页三态选择。
- `src/storage/bainiao-client.ts` 适配白鸟 records/CAS；`src/storage/world-repository.ts` 只读写 `st-dollars / npc-world-{QQJChatId} / world` 单一记录。
- `src/application/people-world.ts` 协调当前目录、本域记录、正文、模型和一次 CAS 发布。读取目录或世界记录失败不会转化为空记录，也不会覆盖已有世界。
- `src/graph/project-world.ts` 根据显式参与 ID 生成图谱联系；`src/graph/layout.ts` 将相关人物与活动按连通组紧凑排位，并为孤立人物生成稳定错落的星点坐标；布局不推断人物关系。图上人物标签仅缩短展示，完整姓名留在概况和资料页。`src/graph/viewport.ts` 提供平移/缩放几何，缩放工具行位于实际绘图区之外。事件只在明确的 `activityId` 下展示。
- `src/index.ts` 创建 ShadowRoot；`src/ui/PanelShell.vue` 在该根内拥有共享窗口与按键边界。`src/ui/GraphPage.vue` 管选择和手机概况/完整阅读层级；`src/ui/NodeOverview.vue` 从同一快照派生短概况。`src/ui/WorldDetails.vue` 展示完整人物、活动和事件资料，`src/ui/PersonMaterials.vue` 只在人物详情内按需读取状态与经历。
- `src/App.vue` 只创建并装配一个世界控制器、窗口、图谱页和设置；`src/ui/AdvanceControls.vue` 展示本次推进及非持久化诊断；`src/ui/ModelSettings.vue` 编辑 Primary/Secondary 的独立配置或共享预设引用。所有页面消费同一业务快照，不各自建控制器或复制资料。
- `src/styles.css` 只供 ShadowRoot 内组件使用，显式重置宿主继承样式。`src/index.ts` 创建 ShadowRoot、挂载共用 FontAwesome 与扩展样式，并装配宿主菜单；窗口外不铺遮罩。
- `src/host/host-context.ts` 集中解析 SillyTavern 与 Luker 上下文入口；`src/index.ts` 负责菜单、面板与 Vue 应用装配。

推进按钮固定开始时的聊天范围、目录、世界记录和正文。无新完成 AI 正文时不发模型或写入；新一批模型或解析失败时不保存；成功后以一次 CAS 发布整个批次。冲突明确反馈，不自动重试。事件含所属活动 ID，获知只由明确人物 ID、事件 ID 和原因记录，不从地图查看推断。

后续主页方向已初步确定为当前活动、图谱、公告、设置；当前仍只交付图谱页、人物概况、资料阅读和模型/外观设置，新增页面尚未实现。自动推进、主楼回流和其他人物资料来源尚未实现。虚构人物起步样例此前已通过真实调用与隔离保存/读取验收；真实卡/长线语义仍待实测。
