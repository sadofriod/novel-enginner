# 06 持久化、Runtime、API、CLI 与 SSE

## 1. Prisma 持久化模型

[prisma/schema.prisma](../../prisma/schema.prisma) 保存 Command、Proposal、ProposalDraft、Run、RunStep、ReviewerResult、OverrideAudit、SyntheticCommit、CapabilityDiscoverySnapshot、DerivedRebuildJob、SearchDocument、BootstrapSession、BootstrapRevision、BootstrapEvidence。canonical 文件本身不复制到数据库，符合 Markdown 作为真相源的原则。

`persistence/operations.ts` 和 `audit-operations.ts` 提供 command/run/proposal/review/draft/audit/derived 的 CRUD 与 mapper；Bootstrap repository 提供 session/revision/evidence 持久化。

## 2. RuntimeStore 与恢复

`runtime/store.ts` 是当前默认读写中枢，保存 artifact summary、run、command、事件、sync session 等进程内状态。API 对 commands、runs、bootstrap 数据有部分 lazy load，但不是完整的数据库-backed repository。`persistCommand()` 与 `persistRun()` 分离调用，进程在两次调用之间退出时可能出现半持久化。

SSE 事件历史也在进程内。数据库保存了运行记录和审计记录，但服务重启后无法完整重建当前进程中的 artifact view、event history 和 synthetic session 聚合。

## 3. HTTP/JSON 与 CLI

主要路由由 `runtime/api-server/routes/routes.ts` 注册：`POST /commands`、commands/runs/artifacts 查询、run SSE、override audit 查询、bootstrap session/revision/evidence 查询、`POST /sync/rebuild-graph` 和 `POST /sync/re-sync-state`。CLI `runtime/cli.ts` 支持 re-sync-state、propose、regenerate、approve、reject、override-approve、export-draft、resume-run、abort-run、retry-step、mark-external-failure。

HTTP 与 CLI 共用 `CommandEnvelope` 和 command handler，这是稳定的控制面基础；但部分 run control 命令目前只是 RuntimeStore 状态修改，并不等价于 Inngest durable resume/retry。

## 4. SSE

`RunEventBus` 支持每个 run 的事件历史、递增 event id、`Last-Event-ID` 补发、有界历史和 terminal event 关闭流。事件涵盖 command、run、artifact、workspace、derived 和 bootstrap。该可靠性细节应补写到目标 API 文档，因为它比现有架构描述更具体。

## 5. 主要差距

- command/run 创建应在一个 transaction 内完成。
- artifact/proposal/run/reviewer/audit 需要统一恢复读模型。
- commit 后应显式同步并发布可恢复事件，而不是主要依赖 watcher。
- API 尚无 search facade、bootstrap SSE 专用恢复链和完整 provenance 查询。
- `export-draft` 的真实文件落点与 `drafts/exported/` 目标合同还需核实/补齐。