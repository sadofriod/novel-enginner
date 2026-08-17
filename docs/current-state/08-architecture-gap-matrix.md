# 08 架构差距矩阵

## 1. 高优先级差距

| 优先级 | 差距 | 影响 | 主要位置 | 建议验收 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P0 | 审批未稳定绑定 ReviewerResult、硬失败和 OverrideAudit provenance | proposal 可能无法正确审批或绕过审计 | `runtime/api-server/proposal`、`workflow`、`persistence` | 生成 proposal -> reviewer -> approve/override -> audit -> canonical commit 的数据库集成测试 | 未解决 |
| P0 | RuntimeStore 不是完整可恢复读模型 | 服务重启后状态、事件和 artifact view 不完整 | `runtime/store.ts`、API lazy recovery | 重启服务后恢复 command/run/proposal/SSE 关键状态 | 未解决 |
| P0 | bootstrap 没有 project-brief 审批到 Book/canonical 原子初始化 | 新书无法可靠进入日常工作流 | `bootstrap-command-handler.ts`、`bootstrap-initializer.ts`、`book-init.ts` | 批准时同事务创建 Book、brief、snapshot；门禁后进入 ready-to-write | 已实现 |
| P0 | import 确认未形成 parser -> canonical -> re-sync -> health 门禁闭环 | 导入内容可能不是合法 canonical 状态 | `confirm-import.ts`、`import-reconcile.ts`、`sync-engine.ts` | 确认导入后解析、引用诊断、snapshot、ready-to-write 全链路 | 已实现 |
| P0 | Web SPA command 上下文和审批提交需验证 | 用户操作可能不真正提交命令 | `WebRouter.tsx`、`ControlConsole.tsx` | Playwright 实际点击 approve，断言 POST /commands 和后端状态 | 未解决 |

## 2. 中优先级差距

| 优先级 | 差距 | 影响 | 建议 | 状态 |
| --- | --- | --- | --- | --- |
| P1 | commit 主要依赖 watcher re-sync | 系统写入后的状态更新和错误反馈不确定 | commit 完成后显式调用 re-sync，并把失败发布为可恢复事件 | 已实现（显式 re-sync + `artifact.commit-failed` recoverable 事件） |
| P1 | 多数 artifact workflow 是 facade | 目标 artifact 的生成、结构校验和失败恢复不完整 | 为每个支持的 artifact 定义输入、Agent、Reviewer、draft、commit 合同 | 部分实现（bootstrap brief 链已接，其余仍 facade） |
| P1 | search 没有对外 facade/API/embedding worker | Agent 和 Web 无法稳定检索 | 增加 workspace/book 隔离的 search service、HTTP/CLI 入口和 Inngest embedding worker | 未解决 |
| P1 | Reviewer 结构化确定性规则覆盖不足 | 关键硬失败依赖模型，难审计 | 将 outline、tech rule、plot clue、emotion curve 比对做成 deterministic checks | 未解决 |
| P1 | bootstrap research 没有 MarketResearchPort/evidence | 研究来源和版权边界不可审计 | 服务端受限 Browser MCP port + evidence persistence + source policy | 已实现端口/策略与 evidence 创建链（真实 MCP 未接） |
| P1 | command/run 不是原子持久化 | 崩溃时命令和运行记录可能分裂 | command、run、初始 step 使用 Prisma transaction | 未解决 |

## 3. 低优先级和文档补充

| 类型 | 发现 |
| --- | --- |
| 文档遗漏 | SSE 支持 Last-Event-ID、有界历史、terminal 自动关闭；应写入 API/runtime 规范。 |
| 文档遗漏 | capability startup 会在服务启动阶段因 missing source 快速失败。 |
| 文档遗漏 | API 还有 runs、artifacts、override audit、Web action 等入口。 |
| 语义风险 | graph 中部分 `knows` 边来自 scene 关系而非 knowledge ledger，需统一边语义。 |
| 结构风险 | `references/imported/` 不在 canonical layout。按架构 §11.4 这是有意为之：未映射内容由 `confirmImport` 隔离到 `references/imported/unmapped/`，不参与 canonical 生成，watcher/derived 不会处理它；显式重新导入（重新扫描 → 新映射 → 重新确认）是唯一回流路径，已实现并有测试。 |
| 测试缺口 | 缺少同一 workspace 多 workflow commit lane、跨书隔离、进程重启、完整 Playwright 验收矩阵。 |

## 4. 推荐实施顺序

已完成：

1. bootstrap 新书原子初始化（project-brief 审批 → Book + brief + 首快照 + 会话推进）。
2. import canonicalization/re-sync（parser → reSyncState → 引用诊断 → health 门禁 → ready-to-write）。
3. canonical commit 后显式 re-sync，并把 commit 失败发布为可恢复的 `artifact.commit-failed` 事件。
4. bootstrap `MarketResearchPort` + evidence 创建链与来源/版权边界策略。

仍待实施：

1. 固定审批门禁、ReviewerResult、OverrideAudit 和 command/run transaction。
2. RuntimeStore 到持久化读模型的恢复边界。
3. 把其余 artifact-specific workflow、结构化 Reviewer checks 和 provenance 接起来。
4. 增加 search facade、embedding worker、API/CLI 入口和 graph 边语义校验。
5. 补齐 Web context、SSE 恢复、重启恢复和完整 Playwright 验收矩阵。

## 6. 端到端验收矩阵进展（`10-v1-execution-plan.md` §10.12）

12 个必测场景均已实现并有自动化测试（`v1-acceptance.test.ts` 等）：

| # | 场景 | 实现 | 测试 |
| --- | --- | --- | --- |
| 1 | 非法 canonical → invalid，保留最后有效快照，阻断 propose | `reSyncState` 保留旧实体 | ✓ |
| 2 | 修复后恢复有效、阻断解除、derived 追平 | `reSyncState` + `buildDerivedGraph` | ✓ |
| 3 | 同一目标连续 propose → 旧 proposal superseded | `createProposal` registry | ✓ |
| 4 | 新快照中止活动 manuscript run 且不自动重启 | `abortDriftedRuns`（不自动 restart，需新 propose） | ✓ |
| 5 | dirty 下批准进入 commit-blocked/waiting-sync，确认后落盘 | `applyProposalCommand` | ✓ |
| 6 | 手改已批准工件 → review-stale + synthetic review | `handleHandEditedArtifact` 派发事件 | ✓ |
| 7 | synthetic review 检出不可豁免错误 → canonical 不回滚、下游阻断 | `synthetic-review-gate.ts` + `POST /review/synthetic-outcome` | ✓ |
| 8 | Web 短文本微修 → 旧 review 失效并触发重检 | `web-commands.ts` 微修后派发 synthetic review | ✓ |
| 9 | capability 缺失 → 装配失败且明确诊断 | `reconcileCapabilities` | ✓ |
| 10 | knowledgeLedger/displayTitle/PlanningAnchor/scene anchors 解析、持久化、API 摘要返回 | `reSyncState` + `buildDerivedGraph` | ✓ |
| 11 | 新书 bootstrap 五轮后 project-brief → 审批后推进到 ready-to-write | `bootstrap-stage-seeding.ts` + `bootstrap-initializer.ts` | ✓（`api-server-bootstrap-chain.test.ts`） |
| 12 | 映射确认前不写 canonical；确认后复制、隔离未识别资料、生成健康报告；原目录变化仅显式重新导入回流 | `confirm-import.ts` 隔离 + 显式 re-import | ✓ |

## 5. 与目标架构文档的对应关系

- 系统边界和不变式： [architecture/modules/01-system-overview.md](../architecture/modules/01-system-overview.md)
- canonical 合同： [architecture/modules/02-canonical-workspace.md](../architecture/modules/02-canonical-workspace.md)
- 领域模型： [architecture/modules/03-domain-model.md](../architecture/modules/03-domain-model.md)
- workflow/Agent： [architecture/modules/04-workflows-and-agents.md](../architecture/modules/04-workflows-and-agents.md)
- Reviewer/质量门禁： [architecture/modules/05-reviewer-and-quality-gates.md](../architecture/modules/05-reviewer-and-quality-gates.md)
- Web/审批： [architecture/modules/06-web-console-and-approval.md](../architecture/modules/06-web-console-and-approval.md)
- API/事件/runtime： [architecture/modules/07-api-events-and-runtime.md](../architecture/modules/07-api-events-and-runtime.md)
- graph/search/capability： [architecture/modules/08-graph-search-and-capabilities.md](../architecture/modules/08-graph-search-and-capabilities.md)
- 执行顺序与验收： [architecture/modules/10-v1-execution-plan.md](../architecture/modules/10-v1-execution-plan.md)
- bootstrap 合同： [architecture/modules/11-bootstrap-and-onboarding.md](../architecture/modules/11-bootstrap-and-onboarding.md)