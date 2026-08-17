# 04 Bootstrap 与 Onboarding

## 1. 两条路径

阶段定义在 `bootstrap/stages/stage-defs.ts`：

- `new-book`：market-research、inspiration-dialogue、project-brief、world-foundation、story-blueprint、volume-outlines、chapter-outline-batch。
- `import`：import-scan、import-mapping、import-confirmation、import-health-report。

session、revision、evidence 类型和 repository 位于 `bootstrap/types.ts` 与 `bootstrap/repositories/prisma-session-repository.ts`。Prisma 支持 30 天 abandoned session 清理。

## 2. 新书流程当前行为

`research-orchestrator.ts` 提供五轮 dialogue 初始化、决策校验、摘要清洗、趋势报告和 schema 合规的 project brief proposal 生成（`generateProjectBriefProposal()` 现在产出满足 `ProjectBriefSchema` 的 `bookId`、`marketScope`、`sourceResearchEvidenceIds`、`assumptionIds` 字段）；`state-machine.ts` 定义 transition/abandon/complete。`bootstrap-command-handler.ts` 负责 runtime 命令和 session 查询。

`continueSession()` 在通过五轮对话门禁、推进到 `project-brief` 阶段时会自动：建立基线快照（`reSyncState([])` → `snap-0001`）、生成 schema 合规的 project-brief Proposal、写入 canonical draft，并把会话置为 `awaiting-approval`。

project-brief 通过通用 `approve` 审批后，`runtime/bootstrap-initializer.ts` 会原子地：以单一 canonical bundle 提交 `state/book/book.md`（planning Book，绑定 brief）与 `state/book/project-brief.md`（status=approved）、re-sync 出首个有效快照，并把会话推进到 `advancing`/`world-foundation`。

world foundation、story blueprint、volume outline、chapter outline 的后续链已完整实现（接受矩阵 #11，`api-server-bootstrap-chain.test.ts` 全链路通过）：`runtime/bootstrap-stage-seeding.ts` 按阶段 seed schema 合规的 proposal + canonical draft（world-foundation、story-blueprint、volume-outlines 的 3 卷、chapter-outline-batch 的首批 3 章细纲，并自动补齐默认 `location-main` 使场景锚点可解析）；`runtime/bootstrap-initializer.ts` 的 `finalizeBootstrapArtifactApproval` 在每次 bootstrap artifact 审批后以 `workspaceValidity='clean'` 提交对应 canonical 文件、从磁盘整体 re-sync（避免只 re-sync 单文件导致其它实体被误删），并把会话推进到下一阶段；`continue-session` 在新书推进过程中逐阶段 seed，直到 chapter-1 细纲审批后进入 `ready-to-write` 并发布 `bootstrap.ready-to-write`。

## 3. 导入流程当前行为

`import-scanner.ts` 扫描并识别实体，`import-mapper.ts` 生成和审批映射，`confirm-import.ts` 在确认后复制 source 文件，`health-report.ts` 检查关键 artifact 是否存在。确认前不会复制文件，这个边界已经实现。

确认复制后，`confirmImport()` 现在会运行 canonical 闭环：把复制的文件交给 `import-reconcile.ts`（`reconcileImportedWorkspace`）执行 `reSyncState`（parse → validate → 引用诊断 → snapshot），把引用断裂 id（`extractUnresolvedReferences`）和 canonical 校验错误一并写入健康报告，并返回 `readyToWrite` 门禁。`applyConfirmedImport` 会把 reconcile 快照写入 `RuntimeStore` 作为首个 last-known-good snapshot；健康报告就绪时会话进入 `ready-to-write` 并发布 `bootstrap.ready-to-write`，否则停留在 `import-review`。`continue-bootstrap-session` 在 `import-health-report` 阶段也会先检查存储的健康报告，未就绪时拒绝推进。

无法可靠映射的未识别内容由 `confirmImport` 隔离到 `references/imported/unmapped/<basename>`（接受矩阵 #12）：隔离内容不参与 canonical 生成（不进入 `reconcileImportedWorkspace` 的 re-sync），在健康报告中以 `isolated-material-*` warning 列出，并通过 `ConfirmImportResult.isolatedPaths` 暴露。原导入目录不自动同步：源目录变化不会回流到 canonical，只有显式重新导入（重新扫描 → 新映射 → 重新审批 → 重新确认）才会更新目标，该流程已有测试覆盖。

## 4. 研究与证据差距

架构要求服务端受限 `MarketResearchPort` 调用 Browser MCP，并保存 evidence、来源和版权边界。现在 `bootstrap/research/market-research-port.ts` 提供了 `MarketResearchPort` 抽象（`research` + `evaluatePolicy`）和确定性来源策略 `evaluateSourcePolicy`（permissive host → allowed，blocked host → blocked，其余 → review-required）。`submitResearch` 会通过该 port 对 `sources` 应用版权边界策略，创建 `BootstrapEvidence` 并关联到 revision 的 `evidenceIds`；`seedProjectBriefProposal` 会把 evidence id 填入 proposal 的 `sourceResearchEvidenceIds`。

浏览器 MCP 的真实受限调用仍未接入（port 的默认 `research` 返回空），来源 evidence 的 Prisma 持久化链和许可/版权边界评估已具备模型与端口，但未与真实 MCP 服务打通。

## 5. 测试状态

已有 stage、state machine、research、scanner、mapper、confirm-import、health-report、canonical-artifacts、Prisma repository 和 bootstrap command 测试。新增覆盖：project-brief proposal 的 `ProjectBriefSchema` 合规性、五轮门禁后的 proposal/draft/基线快照自动生成、project-brief 审批的 Book+brief+首快照原子初始化、导入后的 canonical 重校验/引用诊断/ready-to-write 门禁、continue 门禁、market-research evidence 创建链，以及接受矩阵 #11 的新书全链路（WF→SB→卷→首批细纲→ready-to-write）和 #12 的未识别内容隔离 + 显式重新导入回流。仍缺少恢复后继续和真实 Browser MCP evidence 的集成/E2E 验收。