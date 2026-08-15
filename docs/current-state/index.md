# 当前系统实现与架构差距

状态基线：2026-08-15。

本目录记录当前代码真正实现的系统，而不是目标架构的重复描述。阅读目标架构时，应先看 [architecture/index.md](../architecture/index.md) 与 [architecture/modules/10-v1-execution-plan.md](../architecture/modules/10-v1-execution-plan.md)，再用本目录核对实现状态。

## 阅读顺序

| 文档 | 内容 |
| --- | --- |
| [01-system-and-data-flow.md](./01-system-and-data-flow.md) | 系统边界、启动方式、数据流和运行时读写模型 |
| [02-domain-workspace.md](./02-domain-workspace.md) | 领域 schema、canonical workspace、同步、快照与提交 |
| [03-proposal-workflow-agent.md](./03-proposal-workflow-agent.md) | 命令、Proposal、Inngest、Agent、Reviewer 和能力装配 |
| [04-bootstrap-onboarding.md](./04-bootstrap-onboarding.md) | 新书创建、对话研究、既有 Markdown 导入 |
| [05-graph-search-derived.md](./05-graph-search-derived.md) | graph、SearchDocument、embedding 和派生层 |
| [06-persistence-runtime-api.md](./06-persistence-runtime-api.md) | Prisma、RuntimeStore、API、CLI、SSE 和审计 |
| [07-web-console.md](./07-web-console.md) | Web 路由、控制台、审批操作和 E2E 覆盖 |
| [08-architecture-gap-matrix.md](./08-architecture-gap-matrix.md) | 与目标架构的差距、风险、优先级和验收缺口 |

## 总体结论

当前系统已经是可运行的 V1 骨架，主路径可以概括为：

```text
canonical Markdown
  -> file watcher / re-sync
  -> last-known-good WorkspaceSnapshot
  -> RuntimeStore + derived graph/search
  -> command/API/CLI
  -> Proposal + Run
  -> Agent/Inngest
  -> reviewer / approval
  -> canonical commit
  -> watcher re-sync
```

已经具备较强实现证据的部分：

- Markdown canonical 文件的解析、序列化、引用校验和章节 outline/manuscript 绑定。
- `clean`、`dirty`、`invalid` 工作区状态与最后有效快照保护。
- Proposal supersede、snapshot drift、`waiting-sync`、`commit-blocked` 和 canonical bundle commit 的基础逻辑。
- Reviewer 结构化结果、不可 override 的硬失败、synthetic review 状态。
- Bootstrap session/revision/evidence 数据模型和两条 onboarding 路径的基础状态机。
- graph 派生、SearchDocument 增量索引、Prisma/pgvector 底层访问。
- Bun HTTP API、CLI、SSE、React 控制台和静态/交互 graph 展示。

尚未形成 V1 闭环的部分：

- RuntimeStore 仍是默认进程内读模型，重启恢复不是完整数据库驱动。
- bootstrap 阶段没有稳定推进到 project-brief 审批、Book 原子初始化和 ready-to-write。
- workflow 的多数 artifact facade 不是完整的 artifact-specific 生成流程，Reviewer 接线也不完整。
- graph/search 缺少统一查询 facade、对外搜索 API 和已注册的 embedding worker。
- Web 端部分 SPA 审批调用依赖 `workspaceId`/`bookId` 上下文，override audit、全量 E2E 和跨模块持久化事务仍不足。

## 状态定义

- **已实现**：有源码实现，并有相邻单测、集成测试或运行时入口作为证据。
- **部分实现**：存在类型、纯函数或骨架，但跨模块链路、失败恢复、持久化或用户入口不完整。
- **未实现/未发现**：目标架构有明确要求，但当前调研未找到可执行的完整实现证据。
- **文档遗漏**：代码已经提供，目标架构文档没有充分说明的行为。

## 验证基线

仓库要求所有改动通过 `pnpm typecheck`、`pnpm test` 和 `pnpm exec eslint .`。本次文档调研的代码事实来自源码、相邻测试和现有架构文档；差距矩阵中的“未验收”表示缺少对应的跨模块或 E2E 证据，不表示相关纯函数一定不存在。