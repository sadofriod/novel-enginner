# 02 领域模型与 Canonical Workspace

## 1. 领域合同

领域 schema 集中在 [packages/services/src/domain/schema.ts](../../packages/services/src/domain/schema.ts)，值域在 `values.ts`，推导类型在 `schema-types.ts`。已建模的主要对象包括 Book、ProjectBrief、WorldFoundation、StoryBlueprint、Volume、Character、PlanningAnchor、Relationship、Resource、Faction、Location、TechRule、PlotClue、SceneSkeleton、ChapterOutline、ChapterManuscript、Proposal、CommandEnvelope、ReviewerResult 和 OverrideAudit。

schema 的作用是同时约束 Markdown parser、命令入口、workflow 输出和持久化 mapper。章节 outline 与 manuscript 是两个独立 artifact；manuscript 通过 outline 引用并要求 approved outline。

## 2. 文件到快照

`workspace/layout.ts` 定义 canonical 路径，覆盖 `state/book`、volumes、chapters、characters、facts、relationships、resources、factions、locations、tech-rules、plot-clues、planning-anchors、capabilities、vocabularies、reviewer，以及 `manuscript` 和 `prompts`。

`workspace/markdown.ts` 支持 YAML frontmatter、正文 section 和 `# Scene {sceneId}` 标题。`sync-engine.ts` 对每个文件执行：

- 路径归类与 artifact type 识别。
- frontmatter/正文解析和 Zod 校验。
- ID、目标 kind、实体存在性和章节标题一致性校验。
- manuscript `sceneAnchorIds` 与 Scene heading 完全一致性校验。
- outline approved、chapter number、displayTitle 绑定校验。

非法文件保留在磁盘，但不覆盖 last-known-good snapshot。状态是 `clean`、`dirty` 或 `invalid`。

## 3. 会话同步与提交

`WorkspaceSyncSession` 将一段连续保存聚合为 synthetic commit；`canonical-commit.ts` 支持单文件和 bundle，先写 staging、保留 backup、再 rename，失败时 rollback。`canonical-commit-lane.ts` 为同一本书串行化写入。

系统写入会通过 RuntimeStore 的 internal commit 标记避免 watcher 把自身写入误判成手工修改；手工修改 approved artifact 会派生 `reviewStale` 并请求 synthetic review。

## 4. 当前差异

| 目标要求 | 当前实现 | 状态 |
| --- | --- | --- |
| commit 后可靠 re-sync | 主要依赖 watcher 观察文件变化，缺少显式 commit-after-resync 链路 | 部分实现 |
| bundle 语义一致性 | 有 staging/rollback/lane，但缺少 bundle 内部冲突与 proposal 语义一致性校验 | 部分实现 |
| session 可恢复 | snapshot 可恢复，pending synthetic 聚合状态为进程内 | 部分实现 |
| 领域 cross-field 合同 | 部分约束在 `command-handler.ts`，不全在 domain schema | 部分实现 |
| bootstrap artifact 合同 | `generateProjectBriefProposal()` 当前输出缺少共享 schema 所需字段 | 缺陷 |

## 5. 相关测试

已有 `layout.test.ts`、`sync-engine.test.ts`、`file-watcher.test.ts`、`canonical-commit.test.ts`、`canonical-commit-lane.test.ts` 和 `workspace-sync-coordinator.test.ts`。`session.ts` 没有同名测试文件；跨进程恢复、commit 后显式 re-sync 和 bundle 冲突尚缺集成测试。