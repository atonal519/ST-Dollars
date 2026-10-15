# ST-Dollars 项目接手记录

截至 2026-10-15：版本 0.0.3，通信协议 3，处于 M2B 核心 demo 阶段，尚非完整 V1。真实模型效果尚未由用户完成体验验收。

## 已有与待做

已具备世界书角色识别、匿名大厅、pending 消息修改/删除及 Continue 触发、SQLite 保存、聊天隔离、Primary/Secondary 配置和模型输出格式宽容归一化。Primary 未配置时沿用 Secondary 是原型兼容行为。

仍待实现：M3 私聊、建房和邀请；M4 千千结记忆注入及完整 Event/Knowledge/Focus Catch-up；M5 完整 checkpoint 与回退。2026-10-15 本次重跑：`pnpm test` 68/68 通过，`pnpm run typecheck` 与 `pnpm build` 通过。真实模型效果仍未由用户验收。

## 设计与工作边界

原始 FULL 设计保持冻结。V1 范围和里程碑优先级以既定设计为准，不因代码实现改写设计结论。本次迁移范围完整保留 M2B 工作；具体提交与工作区状态以 `git log` / `git status` 为准。

## 下一步

GitHub 代码托管目标为 https://github.com/atonal519/ST-Dollars。GitHub 托管与服务器实际部署是两件事；服务器尚未部署。下一步与用户确认服务器目录和运行数据迁移范围。模型 Key、世界和消息存于部署目录 `plugins/dollars/dollars.db`；SillyTavern 的 `data/` 与 `config.yaml` 不随本仓库迁移。是否迁移运行数据由用户另行决定，远程继续开发无需先上传私人数据库。

部署验证基线为 Luker 2.8.0 / Node 24.13.0，建议 Node.js 24 或更高版本。前端仓库应放在 `SillyTavern/public/scripts/extensions/third-party/ST-Dollars`；从该标准目录运行 `node scripts/sync-server.mjs` 同步后端到 `SillyTavern/plugins/dollars`，启用 `enableServerPlugins: true` 并重启酒馆。
