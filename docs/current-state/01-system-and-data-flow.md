# 01 系统与数据流

## 1. 运行边界

服务入口是 [packages/services/src/runtime/server.ts](../../packages/services/src/runtime/server.ts)。启动时读取工作区中的 `state/capabilities/registry.md` 与 `mcp.json`，执行 capability startup 校验，创建 API server，注册 Inngest functions，启动 workspace watcher，最后通过 `Bun.serve` 同时提供 API 和 `/api/inngest`。

Web 是独立的 React SPA，由 `packages/web/webpack.config.mjs` 构建；开发时由 webpack-dev-server 提供静态资源，并通过 `/api` 代理到独立 API 服务。Web 不做 SSR，也不在前端服务中托管业务 API。数据库是 Docker Postgres，Prisma 管理运行时表，pgvector 由自定义 migration 管理。

关键环境边界：

| 边界 | 当前实现 |
| --- | --- |
| canonical 真相源 | `state/`、`manuscript/`、`prompts/` 下的文件 |
| 运行时读模型 | [packages/services/src/runtime/store.ts](../../packages/services/src/runtime/store.ts) 的进程内 `RuntimeStore` |
| 持久化层 | [prisma/schema.prisma](../../prisma/schema.prisma) 中的 command、run、proposal、review、audit、bootstrap、derived 表 |
| 异步编排 | Inngest client/function，实际由 Bun handler 暴露 |
| 派生层 | graph、SearchDocument、embedding，原则上从 `WorkspaceSnapshot` 重建 |
| 控制面 | Bun HTTP/JSON、CLI、SSE、独立 React SPA |

## 2. 主数据流

1. `file-watcher.ts` 读取 canonical 文件并防抖调用 `WorkspaceSyncSession.applySave()`。
2. `sync-engine.ts` 按 `layout.ts` 找文件，解析 frontmatter/正文，执行 Zod、引用和章节绑定校验，输出 `WorkspaceSnapshot` 与 workspace validity。
3. `workspace-sync-coordinator.ts` 更新 RuntimeStore，处理 snapshot drift、手工改动、synthetic commit，并触发 graph/search rebuild。
4. `command-handler.ts` 校验 `CommandEnvelope`、执行幂等检查、workspace guard，创建 command/run。
5. `inngest-client.ts` 将部分 artifact/system command 转成事件；Inngest function 运行 Agent 并创建 Proposal/CanonicalDraft。
6. proposal API/workflow 读取 ReviewerResult，处理 approve、reject、override-approve、export-draft。
7. `canonical-commit.ts` 使用 staging、backup、rename 写入 canonical 文件；随后依赖 watcher 观察变更重新同步。

## 3. 运行时事实

当前不是纯数据库驱动架构：`RuntimeStore` 保存大多数 artifacts、runs、events、sync sessions；API 对部分 command/run/bootstrap 数据有 lazy persistence recovery。服务重启后，SSE event history、完整 artifact summary 和进程内 synthetic session 状态不能全部恢复。

这是当前实现和架构文档中“数据库保存 runtime/audit、可恢复流程”的主要差异，详见 [06-persistence-runtime-api.md](./06-persistence-runtime-api.md)。

## 4. 并发与失败模型

- 同一 workspace 的写相关 run 会在新 canonical snapshot 到来时因 drift 中止，不自动 rebase/restart。
- dirty workspace 进入 `waiting-sync`，invalid workspace 进入 `commit-blocked`。
- canonical commit lane 按 book 串行化文件写入。
- Inngest step 提供 retry/checkpoint 边界，但 `resume-run`、`retry-step` 等命令目前主要改变 RuntimeStore 状态，尚未等价于完整 durable workflow resume。
- watcher 的同步回调通过 `void sync()` 异步执行，错误事件、重试和服务重启后的待处理状态仍需补齐。