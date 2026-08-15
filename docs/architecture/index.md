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
| [11-bootstrap-and-onboarding.md](./modules/11-bootstrap-and-onboarding.md) | 新书创建、既有 Markdown 导入与 bootstrap 工程合同 |

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
- [11-bootstrap-and-onboarding.md](./modules/11-bootstrap-and-onboarding.md) 定义进入既有 proposal 主流程之前的新书与导入路径。

## 当前实现状态与目标架构的差距

状态基线：2026-08-15。仓库已经从“只落架构文档”进入 V1 分阶段实现阶段；以下状态描述当前代码，不替代模块 01-11 中的目标合同。

### 已落地的基础能力

- `package.json` 已接入 Bun 服务、Inngest、React Flow、Prisma、pgvector migration 和 Web 控制台所需的主要依赖。
- canonical 工作区样例已经存在于 `state/`、`manuscript/`、`prompts/`，服务端实现位于 `packages/services/src/`，Web 控制台位于 `packages/web/src/`。
- 领域 schema、Markdown round-trip、workspace snapshot、invalid workspace guard、synthetic commit 和 canonical path 规则已有基础实现。
- Proposal、Run、Reviewer/Override audit、bootstrap session/revision/evidence 的 Prisma 模型和部分 repository 已存在。
- Bun API、SSE、CLI、Inngest client/workflow skeleton、graph/search 初版和 capability registry 初版已经存在。

### 尚未满足的 V1 闭环

以下项目是当前实现与文档硬约束之间的主要差距，详细交付顺序和验收方式见 [10-v1-execution-plan.md](./modules/10-v1-execution-plan.md)：

1. 审批路径仍需完整接入 ReviewerResult、不可豁免硬失败和 OverrideAudit provenance。
2. canonical commit 仍需支持 bundled diff 的原子提交，以及同一本书跨 workflow 共享的串行 commit lane。
3. chapter-manuscript 的 outline canonical 前置条件、Reviewer 失败状态和 commit-blocked/waiting-sync 恢复流程仍需补齐。
4. bootstrap 仍需完成 project-brief 批准时 Book、canonical brief 和首个 snapshot 的原子初始化，并补足阶段、revision、恢复和导入边界校验。
5. 受控词表、emotion curve、scene anchors、引用目标 kind 和 manuscript/outline 一致性校验仍需收紧。
6. graph/search 需要完成 workspace/book 隔离、知识边语义和可重建性；capability discovery 需要覆盖 registry、MCP、skill、agent 和 prompt-pack 全部来源。
7. API、CLI、SSE、Web 控制台和 Prisma/Inngest 组合路径仍需覆盖文档 10.12 的完整验收矩阵。

### 当前验收依据

- 规范来源仍是模块 01-08，模块 09 是决策索引，模块 10 是实施顺序和验收矩阵，模块 11 是 bootstrap 与导入合同。
- “已存在代码”不等于“V1 已完成”；只有通过对应的 runtime、数据库和 Playwright 验收，能力才可视为完成。
- 所有实现阶段都必须通过 `pnpm typecheck`、`pnpm test` 和 `pnpm exec eslint .`；涉及数据库、浏览器或 Inngest 的阶段还必须执行对应的集成检查。

建议实施顺序：先完成审批门禁和 canonical 原子提交，再完成 workflow/bootstrap 边界与领域校验，随后补齐 graph/search/capability、API/Web 体验，最后执行完整的 V1 验收矩阵。