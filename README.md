# ST-Dollars

ST-Dollars 是依附于 SillyTavern/Luker 的匿名角色社交插件。当前处于 M2 大厅阶段 demo，不是完整 V1。

## 当前范围

- 已有：从世界书识别角色并初始化匿名大厅；发送的消息先保存为待回应内容，可修改或删除；点击“继续”后才触发角色对话；SQLite 持久化；聊天之间隔离；Primary 与 Secondary 模型配置；对模型返回格式进行宽容归一化。
- 兼容行为：Primary 未配置时沿用 Secondary。这是原型兼容行为；正式 V1 需要配置 Primary。
- 尚未实现：M3 私聊、建房和邀请；M4 千千结记忆注入及完整 Event/Knowledge/Focus Catch-up；M5 完整 checkpoint 与回退。真实模型效果仍待用户验收。

## 部署

本次验证环境为 Luker 2.8.0、Node 24.13.0，建议使用 Node.js 24 或更高版本。将前端仓库放在 `SillyTavern/public/scripts/extensions/third-party/ST-Dollars`。仓库已包含 `dist`，最终用户无需现场编译前端。

首次推送到 GitHub 后，可在 SillyTavern 根目录克隆：

```sh
git clone https://github.com/atonal519/ST-Dollars public/scripts/extensions/third-party/ST-Dollars
```

从上述标准目录运行 `node scripts/sync-server.mjs`，将后端同步到 `SillyTavern/plugins/dollars`。该脚本按标准目录定位，不能从任意 clone 目录运行。然后在 SillyTavern 配置中设置 `enableServerPlugins: true` 并重启酒馆。插件需要前端扩展和服务端插件配合，不能仅安装前端组件独立运行。

模型 Key、世界与消息保存在部署目录 `plugins/dollars/dollars.db`。SillyTavern 的 `data/` 与 `config.yaml` 也不随本仓库迁移；后续是否迁移运行数据由用户另行决定。远程继续开发不需要先把私人数据库上传到 GitHub。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm build
```

修改后端后，需重新同步服务端文件并重启 SillyTavern。

## 演示

`docs/demo/Dollars-M2-Demo.character.json` 包含 3 位虚构成年人及内嵌世界书。导入时保留世界书，使用专用聊天并选择多人卡；先识别角色，再建立大厅。若识别为 0 人，先检查世界书。初始化和“继续”会调用用户配置的模型；模型模拟回复不等于真实模型验收。

## 项目文档

- `agent.md`：项目代码守则；开始工作前完整阅读。
- `AGENTS.md`：自动发现入口。
- `docs/PROJECT_MEMORY.md`：当前接手状态与下一步。
- `docs/DOLLARS_M2B_DESIGN.md`：M2B 方案及实现记录。
- `docs/design/`：原始方案。
