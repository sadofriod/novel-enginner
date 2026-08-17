# 07 Web 控制台

## 1. 页面与路由

`packages/web/src/app/WebRouter.tsx` 注册 workspace 首页、`/bootstrap/:sessionId`、`/app` 和 `/app/new/:artifactType`。`WorkspaceHome.tsx` 支持新建作品、导入作品和恢复 bootstrap session；`BootstrapWorkbench.tsx` 展示 session/revision/evidence、市场研究输入、dialogue、导入 mapping、继续和放弃。`ArtifactAuthoringPage.tsx` 为每个 artifact 类型提供独立编辑入口。

`ControlConsole.tsx` 提供审批队列、工件详情、Proposal diff、bundled diff、Reviewer 结果、run trace 和 derived graph。Web 是纯客户端 SPA：页面由 `createRoot` 挂载，数据通过 **RTK Query**（`control-api.ts`，`fetchBaseQuery` → `/api/*`）请求独立 API；graph 在客户端使用静态 SVG 和 `@xyflow/react`。旧的 `api-client.ts` 已废弃删除，`store.ts` 用 `configureStore` 挂载 `controlApi`，`client.tsx` 用 `Provider` 注入。

## 2. 用户动作

`ArtifactDetail.tsx` 暴露 approve、reject、override-approve、export-draft、delete；`inline-edit-guard.ts` 对 Web 微修施加 200 字限制。`control-api.ts` 提供 `useListArtifactsQuery`、`useListRunsQuery`、`useSubmitCommandMutation`、bootstrap 查询/变更等 hooks；`use-run-event-stream.ts` 用原生 `EventSource` 监听 artifact、run、workspace、derived 事件并触发 RTK Query refetch。

每个 artifact 类型使用独立表单（`proposal-forms/artifact-form-specs.ts` + `ArtifactAuthoringForm.tsx`）填写必需数据，`serialize-form.ts` 把表单状态序列化为 `frontmatter`/`sections`/`scenes`，随 `propose` 命令提交；服务端 `author-proposal.ts` 同步创建 Proposal 与校验过的 canonical draft，不再复用同一个入口。

服务端仍提供 `handleWebCommandAction`，供兼容的 HTML form action 使用；当前 SPA 主要通过 RTK Query 调用 JSON API。两条路径需要保持 envelope、权限/上下文和错误语义一致。

## 3. 已发现的实现风险

SPA `ControlConsole` 的 command 提交依赖 `workspaceId` 和 `bookId`；`ControlConsoleContainer` 通过 `useGetBootstrapConfigQuery` 提供上下文，缺失时不会提交命令。

另外，Web 能展示 override/reviewer 信息不等于 override audit 已经在每条审批路径写入；该链路应由 API 集成测试和数据库测试证明。

## 4. 测试覆盖

已有 `packages/web/src/control-console.test.tsx` 和 `e2e/control-console.spec.ts`，覆盖静态控制台和少量审批/展示场景。现有 Playwright 只有 3 个场景，尚未覆盖架构文档要求的完整 12 项验收：bootstrap 新书、导入、恢复、审批初始化、dirty/invalid 阻断、SSE 恢复、graph/search、重启恢复等。