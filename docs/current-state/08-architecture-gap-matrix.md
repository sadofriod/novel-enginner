# 08 架构差距矩阵

## 1. 高优先级差距

| 优先级 | 差距 | 影响 | 主要位置 | 建议验收 |
| --- | --- | --- | --- | --- |
| P0 | 审批未稳定绑定 ReviewerResult、硬失败和 OverrideAudit provenance | proposal 可能无法正确审批或绕过审计 | `runtime/api-server/proposal`、`workflow`、`persistence` | 生成 proposal -> reviewer -> approve/override -> audit -> canonical commit 的数据库集成测试 |
| P0 | RuntimeStore 不是完整可恢复读模型 | 服务重启后状态、事件和 artifact view 不完整 | `runtime/store.ts`、API lazy recovery | 重启服务后恢复 command/run/proposal/SSE 关键状态 |
| P0 | bootstrap 没有 project-brief 审批到 Book/canonical 原子初始化 | 新书无法可靠进入日常工作流 | `bootstrap-command-handler.ts`、`research-orchestrator.ts` | 五轮对话中断恢复，批准时同事务创建 Book、brief、snapshot |
| P0 | import 确认未形成 parser -> canonical -> re-sync -> health 门禁闭环 | 导入内容可能不是合法 canonical 状态 | `confirm-import.ts`、`sync-engine.ts` | 确认导入后解析、引用诊断、snapshot、ready-to-write 全链路 |
| P0 | Web SPA command 上下文和审批提交需验证 | 用户操作可能不真正提交命令 | `WebRouter.tsx`、`ControlConsole.tsx` | Playwright 实际点击 approve，断言 POST /commands 和后端状态 |

## 2. 中优先级差距

| 优先级 | 差距 | 影响 | 建议 |
| --- | --- | --- | --- |
| P1 | commit 主要依赖 watcher re-sync | 系统写入后的状态更新和错误反馈不确定 | commit 完成后显式调用 re-sync，并把失败发布为可恢复事件 |
| P1 | 多数 artifact workflow 是 facade | 目标 artifact 的生成、结构校验和失败恢复不完整 | 为每个支持的 artifact 定义输入、Agent、Reviewer、draft、commit 合同 |
| P1 | search 没有对外 facade/API/embedding worker | Agent 和 Web 无法稳定检索 | 增加 workspace/book 隔离的 search service、HTTP/CLI 入口和 Inngest embedding worker |
| P1 | Reviewer 结构化确定性规则覆盖不足 | 关键硬失败依赖模型，难审计 | 将 outline、tech rule、plot clue、emotion curve 比对做成 deterministic checks |
| P1 | bootstrap research 没有 MarketResearchPort/evidence | 研究来源和版权边界不可审计 | 服务端受限 Browser MCP port + evidence persistence + source policy |
| P1 | command/run 不是原子持久化 | 崩溃时命令和运行记录可能分裂 | command、run、初始 step 使用 Prisma transaction |

## 3. 低优先级和文档补充

| 类型 | 发现 |
| --- | --- |
| 文档遗漏 | SSE 支持 Last-Event-ID、有界历史、terminal 自动关闭；应写入 API/runtime 规范。 |
| 文档遗漏 | capability startup 会在服务启动阶段因 missing source 快速失败。 |
| 文档遗漏 | API 还有 runs、artifacts、override audit、Web action 等入口。 |
| 语义风险 | graph 中部分 `knows` 边来自 scene 关系而非 knowledge ledger，需统一边语义。 |
| 结构风险 | `references/imported/` 不在 canonical layout，未识别导入内容可能无法进入 watcher/derived 流程。 |
| 测试缺口 | 缺少同一 workspace 多 workflow commit lane、跨书隔离、进程重启、完整 Playwright 验收矩阵。 |

## 4. 推荐实施顺序

1. 先固定审批门禁、ReviewerResult、OverrideAudit 和 command/run transaction。
2. 补齐 canonical commit 后显式 re-sync，以及 RuntimeStore 到持久化读模型的恢复边界。
3. 完成 bootstrap 新书原子初始化和 import canonicalization/re-sync。
4. 把 artifact-specific workflow、结构化 Reviewer checks 和 provenance 接起来。
5. 增加 search facade、embedding worker、API/CLI 入口和 graph 边语义校验。
6. 最后补齐 Web context、SSE 恢复、重启恢复和完整 Playwright 验收矩阵。

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