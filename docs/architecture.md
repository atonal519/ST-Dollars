# 人物世界骨架架构

## 模块边界

- `src/domain/world.ts` 是本插件人物、活动、事件、知情、剧情时间和来源的业务合同。`createEmptyWorld()` 不绑定真实聊天、人物或时间。
- `src/graph/project-world.ts` 从 `WorldSnapshot` 派生人物/活动节点及显式参与关系。图谱不持有第二份业务事实，不根据姓名、地点或主配角身份推断关系。
- `src/application/contracts.ts` 保留未来的人物目录与按题资料读取、世界加载保存、模型请求、单次推进和主楼输入/输出边界；按题材料逐条带稳定 `personId`，不依赖显示名猜归属。它们当前没有实现或服务接线。
- `src/App.vue` 与 `src/graph/WorldGraph.vue` 负责展示图谱与节点详情。小型 SVG 是骨架布局，不是成熟图形引擎。
- `src/host/host-context.ts` 集中解析 SillyTavern 与 Luker 的上下文入口；`src/index.ts` 仅负责菜单、面板和 Vue 应用装配。

人物和事项均来自 `WorldSnapshot`。活动区分 `planned`、`active`、`waiting` 与 `completed`；`WorldEvent` 记录已经发生的结果，`Knowledge` 单独记录某人通过何种原因获知某事件。剧情时间保存故事原文，不是现实日期或等待计时。

玩家是故事外的全知观察者。面板可展示作者可见的世界记录，但这些记录不会因此自动成为故事人物所知。人物不按 char/NPC 或主配角分类。外部角色档案不属于本插件的数据；未来接入时须引用其来源，不能把本插件变成来源数据的写入者。

## 后续设计参考

这些资料提供职责和表达方式的参考，不代表本骨架已经实现相同能力：

- [Concordia Engine](https://github.com/google-deepmind/concordia/blob/main/concordia/environment/engine.py)：环境推进与事件裁定的职责分离。
- [Generative Agents](https://github.com/joonspk-research/generative_agents)：持续行动计划的组织方式；其地图与运行时不能直接移植为文字剧情规则。
- [AI Town 架构](https://github.com/a16z-infra/ai-town/blob/main/ARCHITECTURE.md)：状态、接口和展示边界的分层参考。

该阶段不选定后续模型请求次数，也未安装图形依赖；图形库选型与真实小场景语义验证留待后续授权工作。
