# 11. 新书与导入启动流程

本模块定义作者从零创建作品或导入既有 Markdown 项目时的主流程、canonical 边界和工程合同。已有书籍的 proposal、审批、正文和 review 流程仍以 04-07 为准；本模块只定义它们之前的启动阶段以及两者的衔接。

## 11.1 范围与不变式

- V1 是一 workspace 一本书；项目主页展示最近 workspace，而不是在同一 canonical 目录中混放多本书。
- 新书与导入在确认前都使用可恢复的 runtime `BootstrapSession`，不创建或污染 canonical Markdown。
- 只有作者确认立项简报或导入映射后，系统才创建 canonical 工作区与第一个有效快照。
- bootstrap 会话操作是 system intent；会写入 canonical 的阶段候选仍使用既有 `propose` / `approve` / `reject` Proposal 生命周期。
- 任何已批准的上游工件回改都必须创建新的变更 proposal 并展示下游影响；不得自动改写已落盘正文。

## 11.2 入口与工作台

Web 顶层使用 React Router 数据路由，提供：

- workspace 首页：展示最近 workspace，并提供“新建作品”“导入作品”“继续创建”。
- bootstrap 全屏分阶段工作台：显示当前阶段、可恢复进度、对话或结构化画布、已确认约束和待决项。
- 书籍控制台：只在作品进入 `ready-to-write` 后承接审批队列、图谱和运行追溯。

每个阶段批准后，系统完成落盘和校验并停驻在结果页；作者必须显式点击“继续”才启动下一阶段。未完成会话可恢复或显式丢弃。

## 11.3 新书路径

新书按如下阶段推进：

```mermaid
flowchart LR
  A[market-research] --> B[inspiration-dialogue]
  B --> C[project-brief proposal]
  C -->|author approves| D[create Book + project-brief]
  D --> E[world-foundation proposal]
  E -->|author approves| F[story-blueprint proposal]
  F -->|author approves| G[volume-outlines]
  G --> H[chapter-outline-batch]
  H --> I[ready-to-write]
```

### 市场研究与五轮灵感对话

- 作者先选择题材与目标市场；服务端研究步骤生成带来源链接的趋势简报。
- Browser MCP 只能通过 `MarketResearchPort` 与 capability registry 由服务端受限调用；Web 不直接调用 MCP。
- 趋势简报只能保留抽象趋势、读者偏好、竞争密度和来源证据，不得把受版权保护的作品正文或情节复述写入 canonical。
- 五轮对话采用“固定目标、动态追问”：
  1. 题材、读者与阅读承诺。
  2. 核心创意、主角与开篇钩子。
  3. 核心冲突、对立力量与情感体验。
  4. 差异化、市场趋势取舍与内容边界。
  5. 篇幅与连载形态、终局偏好、待验证假设与立项简报确认。
- 每轮结束保存不可变 bootstrap revision；第 5 轮前必须补齐关键决策。

### 立项与引导式创建

- 五轮结束后自动生成 `project-brief` proposal，作者确认后原子创建 `Book` 与 `project-brief`。
- `world-foundation` 只收敛可验证的世界硬约束，不要求设定百科。
- `story-blueprint` 在世界观最小集批准后生成，用于记录跨卷可验证承诺。
- 系统一次生成全书 `volume-outline` proposal，但每卷独立审批；首卷获批即可继续。
- 首卷获批后默认生成未来 3 章的 `chapter-outline` proposal。每章独立审批，正文默认由作者显式触发。
- 首卷卷纲获批、首批细纲已生成且第 1 章细纲获批时，bootstrap 进入 `ready-to-write`，默认跳转书籍控制台。

### 初始化门禁

- `project-brief`：字段完整性、研究来源与版权边界检查。
- `world-foundation`：增加规则自洽和字段冲突检查。
- `story-blueprint`：增加世界规则、跨卷承诺与因果一致性检查。
- 以上阶段不做文风类 Reviewer 评分；作者始终拥有最终批准权。

## 11.4 导入路径

导入路径按 `import-scan -> import-mapping -> import-confirmation -> import-health-report -> ready-to-write` 推进。

- 扫描既有 Markdown 目录，生成实体识别、目录映射、字段补全建议和解析诊断。
- 作者在映射预览中确认每个文件将成为何种 canonical 工件；确认前不写入 canonical。
- 确认后复制并规范化为新的 canonical 工作区，原始目录保持不变；canonical 副本自此是唯一真相源。
- 无法可靠映射的内容复制到 `references/imported/`，附带来源与诊断，不参与 canonical 生成。
- 导入完成后生成健康报告，列出缺失的 `project-brief`、`world-foundation`、`story-blueprint`、卷纲或细纲、引用断裂和待整理参考资料。作者选择优先补齐项后才启动对应 proposal。
- 原始导入目录不自动同步。作者可显式发起重新导入/差异对比，经过新的映射预览和变更 proposal 回流。

## 11.5 Canonical 工件合同

以下三类为独立 canonical kind、Markdown 契约与 proposal artifact type：

| 工件 | 路径 | 作用 |
| --- | --- | --- |
| `project-brief` | `state/book/project-brief.md` | 创作定位和持续约束来源 |
| `world-foundation` | `state/world/world-foundation.md` | 世界观最小硬规则来源 |
| `story-blueprint` | `state/book/story-blueprint.md` | 全书主线与跨卷承诺来源 |

三者均采用“严格核心 + `extensions` 附录”：前置流程依赖的字段必须在 frontmatter 中通过 Zod 校验，自由阐述写入固定 Markdown section，自定义元数据只允许进入 `extensions`。

### `project-brief`

核心字段：`id`、`bookId`、`title`、`genres`、`targetAudience`、`marketScope`、`readerPromise`、`corePremise`、`openingHook`、`contentBoundaries`、`format`、`sourceResearchEvidenceIds`、`assumptionIds`、`status`、`extensions`。

### `world-foundation`

核心字段：`id`、`bookId`、`eraAndPrimarySetting`、`realityMode`、`tone`、`capabilitySystem`、`immutableRules`、`socialOrder`、`narrativeProhibitions`、`terminologyRefs`、`projectBriefRef`、`status`、`extensions`。

地点、势力、历史和科技规则在需要时继续使用各自独立 canonical 工件，避免双重权威。

### `story-blueprint`

核心字段：`id`、`bookId`、`projectBriefRef`、`worldFoundationRef`、`protagonistArc`、`centralConflict`、`opposition`、`resolutionDirection`、`volumePlan`、`crossVolumeCommitments`、`estimatedVolumeCount`、`status`、`extensions`。

角色档案、章节事件和情绪曲线仍分别由 Character、Volume 和 Chapter 工件承载。

## 11.6 服务端与数据库设计

服务端新增 `packages/services/src/bootstrap/`。该目录按单一职责拆分会话状态机、阶段定义、revision/evidence repository、研究编排、导入扫描与映射、导入确认、健康报告和命令处理；`domain/` 只放共享 Zod schema 和值类型，`runtime/` 只注册 HTTP 路由，`workflow/` 只调度 Agent run，`workspace/` 只处理 Markdown。

### 持久化模型

新增以下 Prisma 模型：

| 模型 | 责任 |
| --- | --- |
| `BootstrapSession` | 当前路径、生命周期状态、业务阶段、临时 workspace/book 标识、当前 revision、完成/丢弃/过期时间 |
| `BootstrapRevision` | 每轮作者输入、结构化草稿、导入映射和诊断的不可变快照 |
| `BootstrapEvidence` | URL、标题、采集时间、清洗后摘要、许可/版权边界和关联 revision |

`BootstrapSession.status` 与 `BootstrapStage` 分离。状态为 `drafting`、`awaiting-approval`、`advancing`、`import-review`、`ready-to-write`、`completed`、`abandoned`、`failed`；阶段使用 11.3 和 11.4 中的枚举值。Agent 执行继续落入既有 `Run` / `RunStep`，两者通过 session ID 和 revision ID 关联。

丢弃会话进入 `abandoned`，其 revision 与 evidence 保留 30 天供恢复，之后级联清理临时内容和导入路径元数据。已获批准且被 canonical 引用的 evidence 不参与清理。

### 命令与 API

- bootstrap 的创建/继续、提交对话轮次、市场研究、导入扫描、确认导入和丢弃使用新的 system intent，写入 `BootstrapSession` 并复用既有 idempotency、Run 和 SSE 语义。
- 初始化候选内容使用既有 `propose`、`approve`、`reject`，并为三个新增 canonical kind 增加 artifact type。
- 新增只读端点：`GET /bootstrap-sessions`、`GET /bootstrap-sessions/:sessionId`、`GET /bootstrap-sessions/:sessionId/revisions`、`GET /bootstrap-sessions/:sessionId/evidence`。

## 11.7 测试与验收

- 每个新增源码文件有同目录同名 Bun 单元测试，覆盖状态转换、schema、Markdown round-trip、映射和健康报告。
- Prisma repository 与 migration 使用数据库集成测试，验证 revision/evidence 关联、30 天清理和事务性初始化。
- runtime 集成测试覆盖 system intent、资源读取端点、幂等、Run/SSE 和 Proposal 衔接。
- Playwright 覆盖趋势简报与五轮恢复、阶段审批推进、导入映射/确认、健康报告和显式重新导入。
- 所有实现必须通过 `pnpm typecheck`、`pnpm test` 与 `pnpm exec eslint .`。