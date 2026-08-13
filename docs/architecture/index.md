# 小说创作 Agent 架构索引

本目录用于把当前项目的目标架构落成一组可执行的模块文档，而不是继续停留在 PRD 和口头约定。

当前文档默认面向 V1：本地工作区优先、Markdown 为唯一真相源、Web 控制台负责审批和可视化、VS Code 负责正文与文档编辑、Bun 服务承载本地运行时、Inngest 负责工作流编排、Docker 中的 Postgres/pgvector 负责索引和审计。

## 阅读顺序

| 模块 | 说明 |
| --- | --- |
| [01-system-overview.md](./modules/01-system-overview.md) | 系统边界、运行拓扑、V1 硬约束 |
| [02-canonical-workspace.md](./modules/02-canonical-workspace.md) | canonical/proposal/derived 工件分层、目录布局、Markdown 契约 |
| [03-domain-model.md](./modules/03-domain-model.md) | 领域实体、章节类型、情绪曲线、伏笔生命周期 |
| [04-workflows-and-agents.md](./modules/04-workflows-and-agents.md) | Inngest 工作流、Agent 职责、Actor 子流程、失败恢复 |
| [05-reviewer-and-quality-gates.md](./modules/05-reviewer-and-quality-gates.md) | Reviewer 评分、硬门禁、豁免、工件级质量规则 |
| [06-web-console-and-approval.md](./modules/06-web-console-and-approval.md) | Web 控制台视图、审批动作、产物类型和预算 |
| [07-api-events-and-runtime.md](./modules/07-api-events-and-runtime.md) | HTTP/JSON + SSE 合同、命令 envelope、事件与运行时边界 |
| [08-graph-search-and-capabilities.md](./modules/08-graph-search-and-capabilities.md) | React Flow 图谱、检索策略、能力注册表、Prompt/Skill/MCP 装配 |
| [09-v1-clarifications.md](./modules/09-v1-clarifications.md) | 已拍板决策的速查摘要与跳转索引 |
| [10-v1-execution-plan.md](./modules/10-v1-execution-plan.md) | 按依赖顺序拆分的完整 V1 实施文档与验收矩阵 |

## 全局不变式

- Markdown 是唯一真相源。数据库、图谱、缓存、审计记录都必须可重建。
- canonical 工件与 proposal 工件分离。未审批内容默认不写入 canonical Markdown。
- 同一本书同一时刻只允许一个会写入 canonical 状态的主流程运行。
- 章节细纲与章节正文是两个独立的 canonical 工件。
- Web 控制台是审批和可视化面，VS Code 是正文与状态文档的主编辑面。
- Drafter 不拥有广泛工具调用权；分析型 Agent 才能默认访问更多 MCP/检索能力。
- 任何强制通过都必须进入 provenance，不能绕过审计层。

## 与现有 PRD 的关系

- [first-step.md](../PRDs/first-step.md) 主要提供了多 Agent 小说系统的初始方向。
- [next-step.md](../PRDs/next-step.md) 主要提供了反 AI 味与工作流原型。
- [novel-agent.md](../PRDs/novel-agent.md) 主要定义了面向作者需求的问题空间。

本目录是在这些 PRD 基础上，将模糊描述收敛成模块边界、工件合同、流程约束和运行时接口。

补充说明：

- 01-08 仍是主规范阅读链路；关键补充决策已经回写到对应模块。
- [09-v1-clarifications.md](./modules/09-v1-clarifications.md) 只保留速查摘要与跳转索引，不再承担主规范正文。
- [10-v1-execution-plan.md](./modules/10-v1-execution-plan.md) 把完整 V1 拆成可顺序实施的工作包和验收条件。

## 当前仓库与目标架构的差距

- 当前 `package.json` 还没有 `inngest`、`@xyflow/react`、用于 pgvector 的数据库扩展接入等运行时依赖。
- 当前仓库还没有 `state/`、`manuscript/`、`prompts/`、`graph/`、`runtime/`、`drafts/` 等工作区目录。
- 当前文档先落架构，不假设代码已经存在。

建议后续按以下顺序推进：

1. 先建 canonical 工作区目录和 Markdown schema。
2. 再落 Bun 服务、命令 API、SSE 事件流和 Inngest workflow。
3. 最后接 Web 控制台、图谱和细化 Reviewer/Actor 契约。