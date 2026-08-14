# 10. V1 执行文档

本模块把完整 V1 拆成按依赖顺序推进的工作包。目标不是列出所有实现细节，而是给出一条可以持续交付、每阶段都有验收标准的落地路径。

## 10.1 实施原则

- 先落 canonical 合同，再落运行时；不要先写 workflow 再反推领域模型。
- 先保证“最后一个有效快照 + 可审计变更 + 可恢复状态机”，再接大模型与 Web 体验。
- 所有 derived 结果都必须可重建，不允许反向成为真相源。
- 任何写 canonical 的主流程都必须在“工作区干净、快照一致、前置检查通过”的前提下提交。

## 10.2 Bootstrap 跨阶段工作流

### 目标

让作者能从 Web workspace 首页创建新书或导入既有 Markdown，并在进入日常审批控制台前获得可恢复、可审计的初始化流程。

这不是一个可脱离后续基础阶段单独交付的 Phase。它必须按本文件既有依赖顺序实现：领域类型和 canonical 契约进入 Phase 1-2，会话持久化进入 Phase 4，命令/API/SSE 进入 Phase 5，proposal/workflow、Agent 能力和 Web 路由分别进入 Phase 6-8。

### 交付物

- 新增 `BootstrapSession`、`BootstrapRevision`、`BootstrapEvidence` Prisma 模型与 migration；实现 30 天 abandoned 会话清理。
- 在 `packages/services/src/bootstrap/` 实现状态机、研究 port、导入映射/确认、健康报告与 repository。
- 新增 `project-brief`、`world-foundation`、`story-blueprint` 的领域 schema、Markdown parser/serializer、canonical 路径和 proposal artifact type。
- 新增 bootstrap system intent、只读 session/revision/evidence API 和 SSE 事件；初始化候选继续走既有 Proposal 生命周期。
- 引入 React Router 数据路由，实现 workspace 首页、全屏 bootstrap 工作台和书籍控制台路由。
- 以 unit、数据库集成、runtime 集成和 Playwright 覆盖新书、导入、恢复、重新导入与阶段推进。

### 验收

- 五轮对话中断后可从相同 session/revision 恢复，且获批前不存在 canonical Markdown。
- `project-brief` 获批时原子创建 `Book` 与 `project-brief`；后续世界观、蓝图、卷纲和细纲遵守显式继续与审批规则。
- 导入在映射确认前不写 canonical；确认后保留原目录、生成规范化副本和健康报告，未识别文件进入 `references/imported/`。
- Browser MCP 调用只发生在服务端受限研究 port，证据可查询且不写入原始网页正文。

## 10.3 Phase 1: 领域合同与类型清理

### 目标

把当前 `src/domain/` 从“架构草图”推进到“可作为解析器、CLI、API、workflow 共同依赖的单一类型源”。

### 交付物

- 补齐 `src/domain/schema.ts`：
  - `Character.knowledgeLedger`
  - `Chapter Outline` / `Chapter Manuscript.displayTitle`
  - `PlanningAnchor`
  - `Proposal.status` 中新增 `superseded`、`commit-blocked` 或等价显式状态
- 补齐 `src/domain/values.ts`：
  - `PlanningAnchor.kind` / `PlanningAnchor.status`
  - 运行时需要的 proposal / run 补充状态
- 为 review freshness、manual risk、invalid workspace、discovered-unregistered 等“非 canonical 主状态”定义 derived/runtime 侧类型，而不是混入 canonical `status`。

### 验收

- `pnpm typecheck` 通过。
- 新类型之间不存在 `knownFactIds` 与 `knowledgeLedger` 并行作为双权威的情况。
- 所有新增状态都能在 TypeScript 层被穷尽检查。

## 10.4 Phase 2: Canonical 工作区与解析/序列化

### 目标

把文档目录落成真实可解析的工作区结构，并提供“Markdown <-> 领域对象”的稳定往返。

### 交付物

- 建立 canonical 目录：
  - `state/book/`
  - `state/volumes/`
  - `state/chapters/`
  - `state/characters/`
  - `state/facts/`
  - `state/relationships/`
  - `state/resources/`
  - `state/factions/`
  - `state/locations/`
  - `state/tech-rules/`
  - `state/plot-clues/`
  - `state/planning-anchors/`
  - `state/capabilities/`
  - `state/vocabularies/`
  - `state/reviewer/`
  - `manuscript/`
  - `prompts/`
- 为 Book、Volume、Character、PlanningAnchor、Chapter Outline、Chapter Manuscript 提供 frontmatter 模板。
- 实现 Scene 标题锚点解析，固定识别 `# Scene {sceneId}`。
- 实现解析器与序列化器，确保 frontmatter 是机器真相源，正文 section 只承载补充说明。

### 验收

- 典型样例文件可 round-trip：Markdown 解析为对象，再序列化回 Markdown，不丢机器字段。
- `displayTitle`、`knowledgeLedger`、`PlanningAnchor`、scene anchors 能被稳定解析。
- 跨实体引用都能通过前缀和存在性校验。

## 10.5 Phase 3: `re-sync-state` 引擎与工作区状态机

### 目标

把“保存即自动同步、最后有效快照、会话级合成审计、invalid 阻断”这套本地工作区语义真正落下来。

### 交付物

- 文件变更监听与防抖调度。
- `re-sync-state` 主流程：
  - 解析 canonical 文件
  - 生成最后一个有效快照
  - 对连续保存聚合 synthetic commit
  - 标记 `dirty` / `invalid` 工作区
- invalid 文件保存语义：
  - 文件保留在磁盘
  - 运行时继续信任最后有效快照
  - 写相关命令全局阻断
- derived 追平队列：graph/search/embedding 异步批处理，不与 canonical/runtime 更新耦成同步大事务。

### 验收

- 连续保存同一文件时只生成一条会话级 synthetic commit。
- 保存无效 frontmatter 时，运行时不会把坏文件认成新 canonical。
- 工作区 invalid 时，`propose` / `approve` / `override-approve` 会被拒绝并返回结构化原因。

## 10.6 Phase 4: Prisma、Postgres 与本地 Inngest 基础设施

### 目标

建立 proposal、run、review、audit、derived index 的持久化底座。

### 交付物

- 本地 Docker Postgres + pgvector。
- Prisma schema：
  - proposals
  - runs
  - run steps / checkpoints
  - reviewer results
  - override audits
  - synthetic commits
  - capability discovery snapshots
  - derived rebuild jobs
- 自定义 migration 启用 `vector` 扩展。
- pgvector 表通过 Prisma `Unsupported("vector")` + raw SQL / TypedSQL 接入。
- 本地 Inngest 运行时与 Bun 服务连通。

### 验收

- 本地启动后可创建工作区级 schema。
- Prisma 负责常规表迁移，vector 相关 SQL 能成功应用。
- Bun 服务能向本地 Inngest 发起事件并接收 workflow 回调。

## 10.7 Phase 5: Bun API、CLI 与 SSE 控制面

### 目标

建立作者可实际使用的控制面入口与最小可观察性。

### 交付物

- HTTP API：
  - `POST /commands`
  - `GET /commands/:commandId`
  - `GET /runs/:runId`
  - `GET /runs/:runId/stream`
  - `GET /artifacts/:artifactType/:targetId`
  - `POST /sync/rebuild-graph`
  - `POST /sync/re-sync-state`
- Bun CLI：
  - `re-sync-state`
  - `propose <artifactType> <targetId>`
  - `regenerate ...`
  - `export-draft ...`
  - `resume-run ...`
  - `abort-run ...`
- SSE 事件流：
  - `command.accepted`
  - `run.started`
  - `run.step.completed`
  - `run.step.failed`
  - `run.waiting-approval`
  - `artifact.proposed`
  - `artifact.approved`
  - `artifact.override-approved`
  - `artifact.canonical-committed`
  - `derived.ready`
  - `run.completed`
  - `run.aborted`

### 验收

- CLI 与 HTTP 使用同一套 `CommandEnvelope` 校验。
- 任何命令都能返回 `commandId`、`runId`、`status` 与 SSE channel。
- CLI 触发命令后，Web 可通过 SSE 看到状态变化。

## 10.8 Phase 6: Proposal 生命周期与 Workflow 骨架

### 目标

把 proposal、run、approval、supersede、commit-blocked 这些状态机变成真实的可恢复流程。

### 交付物

- `chapter-outline` workflow skeleton
- `chapter-manuscript` workflow skeleton
- `volume-outline` workflow skeleton
- `world-change` workflow skeleton
- proposal 创建规则：
  - 同目标活跃 proposal 自动 supersede
  - snapshot drift 使旧 proposal 失去批准资格
  - `export-draft` 进入终态并等待新 proposal 回流
- run 中止规则：
  - 快照漂移自动中止写相关 run
  - 不自动 restart
- canonical commit 阶段：
  - dirty / invalid workspace 阻断落盘
  - proposal 进入 `commit-blocked` / `waiting-sync`
  - 工作区恢复后进入待确认队列

### 验收

- 为同一 `artifactType + targetId` 连续生成 proposal 时，旧 proposal 自动进入 `superseded`。
- 活动中的主流程遇到新快照时，会中止并留下明确 drift 原因。
- 已批准 proposal 在 dirty workspace 下不会误写 canonical。

## 10.9 Phase 7: Agent 装配、Prompt 分层与 Reviewer

### 目标

接通默认 OpenAI provider、三层模型装配、受限 MCP 与规则优先 Reviewer。

### 交付物

- Provider 抽象与 OpenAI 默认实现。
- Agent 模型三层映射。
- capability 装配：
  - `state/capabilities/registry.md` 作为权威源
  - `mcp.json` / skill / agent 扫描作为发现源
  - `discovered-unregistered` 与 missing source 诊断
- Reviewer：
  - `state/reviewer/` 结构化规则读取
  - prompt 指导拼装
  - 规则束 + 模型证据输出
  - `overrideEligible` 计算
  - 不可豁免失败阻断
- hand-edited protected artifact 的 synthetic review 与 review freshness 派生状态。

### 验收

- Reviewer 输出结构化结果并持久化为独立审计实体。
- 手工直改正文后会看到 `review-stale` 风险标记，并异步生成 synthetic review。
- missing capability source 会阻断依赖它的 Agent 装配。

## 10.10 Phase 8: Web 控制台

### 目标

提供审批、运行追踪、工件 diff 与剧情图谱的本地控制台。

### 交付物

- React SPA 基础框架。
- 审批队列、工件详情、运行追溯页面。
- proposal diff、bundled state diff、Reviewer 结构化结果视图。
- `commit-blocked / waiting-sync` 待确认队列。
- Web 微调边界：
  - 结构字段
  - scene / emotion 结构
  - 总计不超过约 200 汉字的短文本微修
- 任何内容性微调都会使旧 review 失效并触发重检。

### 验收

- 能在详情页完成 `approve`、`reject`、`override-approve`、`export-draft`。
- 对被阻断 proposal，界面可明确显示“已批准但未落盘”。
- Web 微调后，旧 review 不会被错误复用。

## 10.11 Phase 9: Graph、Search 与 Embedding

### 目标

把 derived 层补齐，但继续保持它对 canonical 的单向依赖。

### 交付物

- React Flow 节点/边生成：
  - `Chapter`
  - `PlotClue`
  - `Character`
  - `Faction`
  - `Location`
  - `TechRule`
  - `Scene`
- `knows` / `misunderstands` 边由 `knowledgeLedger` 生成。
- 摘要层 embedding 入库。
- 基于 raw SQL / TypedSQL 的向量检索。
- `PlanningAnchor` 只进入详情页与摘要，不上主图。

### 验收

- graph/search 不需要成为真相源即可从 canonical 重建。
- `knowledgeLedger` 改动后可影响相关图边和检索摘要。
- embedding 仅覆盖摘要层，不直接拿全量正文做主索引单位。

## 10.12 Phase 10: 端到端验收矩阵

### 必测场景

1. 作者保存了一个 frontmatter 非法的 `Character` 文件，工作区进入 invalid，运行时仍保留最后有效快照，新的 `propose` 被阻断。
2. 作者修复该文件后，工作区恢复有效，阻断解除，derived 异步追平。
3. 同一章节 outline 连续两次 `propose`，旧 proposal 自动 `superseded`。
4. 活动中的 `chapter-manuscript` run 执行期间，作者手工修改 canonical 生成新快照，run 自动中止且不自动重启。
5. 已批准 proposal 在 dirty workspace 下进入 `commit-blocked`，工作区清理后进入待确认队列，确认后才落盘。
6. 作者手改已批准 manuscript，系统标记 `review-stale`，并异步生成 synthetic review。
7. synthetic review 对手改正文检出不可豁免错误，canonical 不回滚，但下游自动流程被阻断。
8. Web 端对 proposal 做短文本微修后，旧 review 失效并触发重检。
9. capability registry 缺失某个被 workflow 依赖的真实能力源时，相关 Agent 装配失败并给出明确诊断。
10. `knowledgeLedger`、`displayTitle`、`PlanningAnchor`、scene anchors 全部能被解析、持久化并在 API 摘要中返回。
11. 新书 bootstrap 在第五轮后创建可审批的 `project-brief`，确认前可恢复且不写 canonical；确认后按世界观、蓝图、卷纲和首批细纲推进到 `ready-to-write`。
12. 导入会话在映射确认前不写 canonical，确认后复制规范化内容、隔离未识别资料并生成健康报告；原目录变化只有显式重新导入才能回流。

## 10.13 推荐实施顺序

1. 在 Phase 1 启动 Bootstrap 跨阶段工作流：先落类型与 canonical 契约，再完成“最后有效快照 + 自动 `re-sync-state` + invalid 阻断”的本地核心循环。
2. 再完成 Phase 4-6，把 proposal、workflow、approval、commit-blocked 语义真正跑通。
3. 然后完成 Phase 7-9，把 Agent、Reviewer、Web 与 graph/search 接到这条稳定主干上。
4. 最后用 Phase 10 的验收矩阵做端到端收口，而不是边做边放宽状态语义。