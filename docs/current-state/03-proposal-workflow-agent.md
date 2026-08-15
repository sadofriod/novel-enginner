# 03 Proposal、Workflow 与 Agent

## 1. Proposal 生命周期

主要实现位于 `workflow/proposal-lifecycle.ts` 与 `runtime/api-server/proposal/proposal.ts`。同一 `artifactType + targetId` 的活跃 proposal 会被 supersede；新 snapshot 会使旧 proposal 失去批准资格；reject/export-draft 是终态；dirty/invalid workspace 分别进入 `waiting-sync`/`commit-blocked`。恢复后不会自动写 canonical，而是回到待确认状态。

Proposal 可以关联 `CanonicalDraft`、ReviewerResult、OverrideAudit 和 bundled diff refs。审批路径包括 approve、reject、override-approve、export-draft。

## 2. Workflow 实际范围

已注册或可见的 Inngest function 包括：

- `projectBriefFunction`、`worldFoundationFunction`、`storyBlueprintFunction`。
- `chapterOutlineFunction`、`chapterManuscriptFunction`、`volumeOutlineFunction`、`worldChangeFunction`。
- `syntheticReviewFunction` 和 `rebuildGraphFunction`。

chapter outline 路径已经串起 re-sync、WorldBuilder、PlotPlanner、canonical draft 校验、Proposal 创建和 draft 保存；manuscript 会检查 approved outline。`artifact-workflows.ts` 还提供 14 类 artifact workflow facade，但多数是共享生命周期函数的包装，不是独立的生成实现。

## 3. Agent 装配

`agent/provider.ts` 提供 OpenAI provider 和 flagship/balanced/economy 模型层级；`model-tiers.ts` 组装：

```text
system-hard-rules
-> project-policy
-> agent-role-template
-> artifact-type-template
-> task-parameters
```

角色包括 WorldBuilder、PlotPlanner、Actor、Drafter、Reviewer 等。`capability-registry.ts` 将 registry 视为 authority，并从 `mcp.json`、skills、agents、prompt packs 发现能力，处理 unregistered 和 missing-source；服务启动时会因缺 source 抛出 `CapabilityAssemblyError`。

当前 AgentTask 主要把 `capabilityIds` 拼入 prompt。没有看到将 source、MCP tool 或 skill 执行接口实际注入模型的完整路径；MCP scope 目前只是角色对应的字符串列表。

## 4. Reviewer

`reviewer.ts` 执行 deterministic rule bundle 与 model evidence 合并，输出 hard failures、dimension scores、total score、rewrite directives、overrideEligible。当前确定性规则主要是 banned terms 和 paragraph length；结构漂移、tech tree violation、clue payoff conflict 等大量规则仍依赖模型 evidence。`synthetic-review.ts` 处理 approved artifact 被手工修改后的 stale 状态。

## 5. 关键差距

- chapter outline workflow 创建 proposal 后未完整接入 `requestReviewerModelEvidence()`/`assembleReviewerResult()`，启用 Prisma 时可能无法审批。
- character/faction/location/tech-rule/fact/relationship/resource 等命令没有完整 Inngest generation dispatch。
- workflow 上下文多为 `workspace=...; book=...` 字符串，尚未稳定读取完整 canonical snapshot、graph、search context。
- reviewer model JSON 缺少 schema-aware retry、错误分类和可恢复 step。
- prompt、agent、skill、MCP 版本和实际能力清单没有完整写入 proposal/run provenance。