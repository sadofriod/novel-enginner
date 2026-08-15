# 04 Bootstrap 与 Onboarding

## 1. 两条路径

阶段定义在 `bootstrap/stages/stage-defs.ts`：

- `new-book`：market-research、inspiration-dialogue、project-brief、world-foundation、story-blueprint、volume-outlines、chapter-outline-batch。
- `import`：import-scan、import-mapping、import-confirmation、import-health-report。

session、revision、evidence 类型和 repository 位于 `bootstrap/types.ts` 与 `bootstrap/repositories/prisma-session-repository.ts`。Prisma 支持 30 天 abandoned session 清理。

## 2. 新书流程当前行为

`research-orchestrator.ts` 提供五轮 dialogue 初始化、决策校验、摘要清洗、趋势报告和 project brief proposal 生成；`state-machine.ts` 定义 transition/abandon/complete。`bootstrap-command-handler.ts` 负责 runtime 命令和 session 查询。

当前 `continueSession()` 的主要动作是校验阶段、创建 revision、推进 `currentStage`、发布事件。它不会自动完成五轮对话到 project-brief Proposal、project-brief 审批到 Book/canonical brief 原子初始化，也不会可靠驱动后续 world foundation、story blueprint、volume outline、chapter outline 的 proposal/approval 链。

此外，`generateProjectBriefProposal()` 的结果缺少 `ProjectBriefSchema` 要求的 `bookId`、`marketScope`、research evidence 和 assumptions 等字段。

## 3. 导入流程当前行为

`import-scanner.ts` 扫描并识别实体，`import-mapper.ts` 生成和审批映射，`confirm-import.ts` 在确认后复制 source 文件，`health-report.ts` 检查关键 artifact 是否存在。确认前不会复制文件，这个边界已经实现。

当前复制的是原始内容，不是经过 canonical parser/serializer 的规范化 Markdown；确认后也没有可靠的 re-sync、snapshot 建立、引用断裂诊断和 ready-to-write 门禁。未识别内容默认放到 `references/imported/reference.md`，但该路径不在 canonical layout rules 中。重新导入、差异比较和显式 re-import proposal 尚未形成。

## 4. 研究与证据差距

架构要求服务端受限 `MarketResearchPort` 调用 Browser MCP，并保存 evidence、来源和版权边界。当前 research orchestrator 是纯字符串/默认值生成器，没有 Browser MCP research port、来源 evidence 采集或版权边界处理；`BootstrapEvidence` 虽有模型和 repository，但 runtime command handler 没有完整创建链。

## 5. 测试状态

已有 stage、state machine、research、scanner、mapper、confirm-import、health-report、canonical-artifacts、Prisma repository 和 bootstrap command 测试。缺少新书端到端审批初始化、导入后 re-sync、恢复后继续、重新导入差异和 Browser MCP evidence 的集成/E2E 验收。