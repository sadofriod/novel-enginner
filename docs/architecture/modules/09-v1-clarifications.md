# 09. V1 决策摘要

本模块不再承载主规范正文，而是把已经回写到 01-08 的关键决策整理成速查摘要与跳转索引。

规则：

- 01-08 是主规范阅读链路。
- 本文件只做摘要与导航；如果摘要与主模块存在冲突，以主模块为准。
- 实施顺序与验收条件集中记录在 [10-v1-execution-plan.md](./10-v1-execution-plan.md)。

## 9.1 Proposal、运行时与快照

| 主题 | 已拍板结论 | 主规范位置 |
| --- | --- | --- |
| 同目标 proposal | 新的 `propose` / `regenerate` 自动 supersede 旧活跃 proposal | [04-workflows-and-agents.md](./04-workflows-and-agents.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| 基线漂移 | `basedOnCanonicalVersion` 落后后不能直接批准落盘 | [02-canonical-workspace.md](./02-canonical-workspace.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| 活动 run 漂移 | 写相关 run 遭遇新快照时自动中止，不自动重启 | [04-workflows-and-agents.md](./04-workflows-and-agents.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| `export-draft` | 原 proposal 进入 `exported` 终态，回流必须创建新 proposal | [02-canonical-workspace.md](./02-canonical-workspace.md), [06-web-console-and-approval.md](./06-web-console-and-approval.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| 批准后无法落盘 | proposal 进入 `commit-blocked` / `waiting-sync`，工作区恢复后待作者确认继续 | [04-workflows-and-agents.md](./04-workflows-and-agents.md), [06-web-console-and-approval.md](./06-web-console-and-approval.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |

## 9.2 canonical 工作区与手工编辑

| 主题 | 已拍板结论 | 主规范位置 |
| --- | --- | --- |
| 自动回流 | canonical 文件保存即自动进入 `re-sync-state` | [01-system-overview.md](./01-system-overview.md), [02-canonical-workspace.md](./02-canonical-workspace.md) |
| 合成审计粒度 | 连续保存聚合为编辑会话级 synthetic commit | [01-system-overview.md](./01-system-overview.md), [02-canonical-workspace.md](./02-canonical-workspace.md) |
| 非法保存语义 | 文件保留在工作区，运行时继续使用最后一个有效快照 | [01-system-overview.md](./01-system-overview.md), [02-canonical-workspace.md](./02-canonical-workspace.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| invalid 阻断 | 工作区 `invalid` 时阻断新的写相关命令与 canonical commit | [01-system-overview.md](./01-system-overview.md), [02-canonical-workspace.md](./02-canonical-workspace.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| 手工直改 protected artifact | 已批准 outline / manuscript 直改可直接成为 canonical，但会触发 `review-stale` 与 synthetic review | [02-canonical-workspace.md](./02-canonical-workspace.md), [05-reviewer-and-quality-gates.md](./05-reviewer-and-quality-gates.md) |

## 9.3 领域模型与 Markdown 合同

| 主题 | 已拍板结论 | 主规范位置 |
| --- | --- | --- |
| `Character` 认知账本 | canonical 字段名固定为 `knowledgeLedger`，不再以 `knownFactIds` 作为权威真相源 | [02-canonical-workspace.md](./02-canonical-workspace.md), [03-domain-model.md](./03-domain-model.md) |
| 通用跨实体引用 | 继续使用带类型前缀的稳定 ID 字符串 | [03-domain-model.md](./03-domain-model.md) |
| `PlanningAnchor` | promise / constraint / milestone 统一建模为轻量 canonical 实体 | [02-canonical-workspace.md](./02-canonical-workspace.md), [03-domain-model.md](./03-domain-model.md) |
| 章节标题 | outline / manuscript 都可带 `displayTitle`，且默认保持一致 | [02-canonical-workspace.md](./02-canonical-workspace.md), [03-domain-model.md](./03-domain-model.md) |
| scene 锚点 | V1 固定使用 Markdown 标题 `# Scene {sceneId}` | [02-canonical-workspace.md](./02-canonical-workspace.md), [03-domain-model.md](./03-domain-model.md) |
| 受控词表 | `stage`、`worldview`、`techLevel`、`purpose`、`relationType`、`resourceType`、`type`、`tier`、`visibility` 等进入项目级词表 | [02-canonical-workspace.md](./02-canonical-workspace.md), [03-domain-model.md](./03-domain-model.md) |

## 9.4 Reviewer、Web 与能力治理

| 主题 | 已拍板结论 | 主规范位置 |
| --- | --- | --- |
| 去 AI 味检测 | 采用“规则束 + 模型证据”组合 | [05-reviewer-and-quality-gates.md](./05-reviewer-and-quality-gates.md) |
| 不可豁免集合 | `outline-structure-drift`、`tech-tree-violation`、`clue-payoff-conflict` 不允许 override | [05-reviewer-and-quality-gates.md](./05-reviewer-and-quality-gates.md) |
| Web 微调边界 | 允许结构字段、scene / emotion 结构与不超过约 `200` 汉字的短文本微修 | [06-web-console-and-approval.md](./06-web-console-and-approval.md) |
| 微调后的评审 | 任何内容性微调都会使旧 review 失效并触发重检 | [05-reviewer-and-quality-gates.md](./05-reviewer-and-quality-gates.md), [06-web-console-and-approval.md](./06-web-console-and-approval.md) |
| capability 权威源 | `state/capabilities/registry.md` 为权威，其他源只做发现 | [08-graph-search-and-capabilities.md](./08-graph-search-and-capabilities.md) |
| 未登记 / 缺失能力 | `discovered-unregistered` 只告警；registry 声明但缺失真实源时阻断依赖 workflow | [08-graph-search-and-capabilities.md](./08-graph-search-and-capabilities.md) |

## 9.5 默认技术轮廓

| 主题 | 已拍板结论 | 主规范位置 |
| --- | --- | --- |
| 控制面入口 | Bun CLI 负责命令触发，Web 负责审批、追踪和图谱 | [01-system-overview.md](./01-system-overview.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| Provider | Provider 抽象 + OpenAI 默认实现 | [01-system-overview.md](./01-system-overview.md) |
| 数据访问 | Prisma 为主，pgvector 相关查询用原生 SQL 补位 | [01-system-overview.md](./01-system-overview.md), [07-api-events-and-runtime.md](./07-api-events-and-runtime.md) |
| Inngest 形态 | 本地开发 / 自托管 | [01-system-overview.md](./01-system-overview.md), [04-workflows-and-agents.md](./04-workflows-and-agents.md) |
| 默认外部 MCP | `cloakbrowser` 仅对分析型 Agent 开放 | [08-graph-search-and-capabilities.md](./08-graph-search-and-capabilities.md) |
