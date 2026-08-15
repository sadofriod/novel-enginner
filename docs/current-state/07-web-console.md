# 07 Web 控制台

## 1. 页面与路由

`packages/web/src/app/WebRouter.tsx` 注册 workspace 首页、`/bootstrap/:sessionId` 和 `/app`。`WorkspaceHome.tsx` 支持新建作品、导入作品和恢复 bootstrap session；`BootstrapWorkbench.tsx` 展示 session/revision/evidence、市场研究输入、dialogue、导入 mapping、继续和放弃。

`ControlConsole.tsx` 提供审批队列、工件详情、Proposal diff、bundled diff、Reviewer 结果、run trace 和 derived graph。graph 在服务端可使用静态 SVG，在客户端使用 `@xyflow/react`。

## 2. 用户动作

`ArtifactDetail.tsx` 暴露 approve、reject、override-approve、export-draft、delete；`inline-edit-guard.ts` 对 Web 微修施加 200 字限制。`api-client.ts` 支持 command、查询和 `openRunStream()`；SSE 监听 artifact、run、workspace、derived 事件。

服务端还提供 `handleWebCommandAction`，支持 HTML form action、审批和 redirect。该路径与 SPA ApiClient 是两套入口，需要保持 envelope、权限/上下文和错误语义一致。

## 3. 已发现的实现风险

SPA `ControlConsole` 的 command 提交依赖 `workspaceId` 和 `bookId` 都存在；`WebRouter` 创建控制台时主要传入 `apiClient`，因此需要确认当前页面是否始终能提供这两个上下文。若上下文缺失，按钮可能只更新本地 UI 而不提交命令。

另外，Web 能展示 override/reviewer 信息不等于 override audit 已经在每条审批路径写入；该链路应由 API 集成测试和数据库测试证明。

## 4. 测试覆盖

已有 `packages/web/src/control-console.test.tsx` 和 `e2e/control-console.spec.ts`，覆盖静态控制台和少量审批/展示场景。现有 Playwright 只有 3 个场景，尚未覆盖架构文档要求的完整 12 项验收：bootstrap 新书、导入、恢复、审批初始化、dirty/invalid 阻断、SSE 恢复、graph/search、重启恢复等。