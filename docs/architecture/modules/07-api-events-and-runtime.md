# 07. API、事件与运行时合同

## 7.1 通信模式

- 控制面：本地 `HTTP/JSON`
- 实时面：`SSE`
- 不使用 WebSocket

模型：同步命令接入，异步事件推进。

补充规则：本地 Bun CLI 与 HTTP API 共享同一套命令 envelope 和状态语义，只是入口不同。

## 7.2 统一命令 envelope

所有创建、审批、恢复和系统同步类命令共享统一 envelope。

补充规则：`artifactType` 只在 proposal / approval 类 intent 中使用；`rebuild-graph`、`re-sync-state` 和 bootstrap session 操作等系统 intent 使用 `systemTaskType`，此时 `artifactType` 与 `targetId` 可以为空。

```json
{
  "workspaceId": "workspace-cybernovel-001",
  "bookId": "book-quantum-ascension",
  "artifactType": "chapter-outline",
  "targetId": "chapter-0042-outline",
  "intent": "propose",
  "requestedBy": "author-local",
  "approvalMode": "manual",
  "budgetOverride": {
    "targetWordCount": 3200
  },
  "idempotencyKey": "cmd-20260812-001"
}
```

## 7.3 `intent` 枚举

### 创作与审批类

- `propose`
- `regenerate`
- `approve`
- `reject`
- `override-approve`
- `export-draft`
- `rebuild-graph`
- `re-sync-state`

### 恢复类

- `retry-step`
- `resume-run`
- `abort-run`
- `mark-external-failure`

### Bootstrap system intent

新建/继续 session、提交对话轮次、市场研究、导入扫描、确认导入和丢弃 session 使用 bootstrap system intent。它们复用命令幂等、Run 与 SSE，但只更新 `BootstrapSession`；阶段候选内容仍使用 `propose` / `approve` / `reject`。具体状态机见 11。

## 7.4 最小命令响应

命令被接受后，应立即返回最小追踪信息。

```json
{
  "commandId": "cmd-20260812-001",
  "runId": "run-chapter-0042-001",
  "acceptedAt": "2026-08-12T10:00:00Z",
  "status": "accepted",
  "artifactType": "chapter-outline",
  "targetId": "chapter-0042-outline",
  "nextExpectedState": "proposal-pending",
  "sseChannel": "/runs/run-chapter-0042-001/stream"
}
```

## 7.4.1 最小 proposal 快照

proposal 是一等、不可变的审计实体。最小快照建议包括：

```json
{
  "proposalId": "proposal-chapter-0042-002",
  "artifactType": "chapter-manuscript",
  "targetId": "chapter-0042",
  "status": "pending-approval",
  "basedOnCanonicalVersion": "snap-book-001-20260812-01",
  "entityVersionRefs": [
    {
      "entityId": "char-lin-mo",
      "version": "snap-char-lin-mo-20260812-02"
    }
  ],
  "parentRunId": "run-chapter-0042-001",
  "supersedesProposalId": "proposal-chapter-0042-001",
  "latestReviewResultId": "review-proposal-chapter-0042-002"
}
```

说明：`basedOnCanonicalVersion` 的审批主锚点是书级全局快照版本；各工件自己的修订号通过 `entityVersionRefs` 作为诊断信息补充存在。完整 `ReviewerResult` 与 `OverrideAudit` 作为独立、不可变的审计实体持久化，proposal 只保留引用。

## 7.4.2 Proposal 补充生命周期语义

- 当同一 `artifactType + targetId` 再次发起 `propose` 或 `regenerate` 时，新 proposal 自动 supersede 旧活跃 proposal。
- `basedOnCanonicalVersion` 一旦落后于当前书级快照，proposal 就不能直接进入 canonical 写入路径。
- `export-draft` 是 proposal 的显式终态动作；人工深改回流时必须创建新的 proposal。
- 审批完成但因工作区 `dirty` / `invalid` 无法落盘时，proposal 进入显式 `commit-blocked` / `waiting-sync` 状态。
- 活动中的写相关 run 若遭遇新的 canonical 快照，应被自动中止并记录 drift 原因，而不是在中途 rebase。

## 7.5 推荐本地 API 面

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/commands` | 提交统一命令 |
| `GET` | `/commands/:commandId` | 查询命令状态 |
| `GET` | `/runs/:runId` | 查询运行快照 |
| `GET` | `/runs/:runId/stream` | SSE 订阅运行事件 |
| `GET` | `/artifacts/:artifactType/:targetId` | 查询 canonical 或 proposal 摘要 |
| `GET` | `/bootstrap-sessions` | 查询可恢复 bootstrap session |
| `GET` | `/bootstrap-sessions/:sessionId` | 查询 session 当前状态 |
| `GET` | `/bootstrap-sessions/:sessionId/revisions` | 查询不可变阶段 revision |
| `GET` | `/bootstrap-sessions/:sessionId/evidence` | 查询研究来源证据 |
| `POST` | `/sync/rebuild-graph` | 手动刷新图谱 |
| `POST` | `/sync/re-sync-state` | 重新解析 canonical Markdown |

## 7.6 SSE 事件类型

推荐最小事件集：

- `command.accepted`
- `run.started`
- `run.step.completed`
- `run.step.failed`
- `run.waiting-approval`
- `artifact.proposed`
- `artifact.canonical-committed`
- `artifact.approved`
- `artifact.rejected`
- `artifact.override-approved`
- `artifact.commit-blocked`
- `artifact.review-stale`
- `derived.ready`
- `derived.failed`
- `run.completed`
- `run.aborted`
- `external.failure`
- `workspace.invalid`
- `workspace.valid`
- `bootstrap.session.updated`
- `bootstrap.stage.changed`
- `bootstrap.ready-to-write`

## 7.7 Inngest 事件建议

| 事件名 | 用途 |
| --- | --- |
| `novel.chapter-outline.requested` | 请求单章细纲 proposal |
| `novel.chapter-manuscript.requested` | 请求单章正文草稿 |
| `novel.world-change.requested` | 请求世界观变更提案 |
| `novel.volume-outline.requested` | 请求分卷大纲提案 |
| `novel.sync.rebuild-graph` | 刷新图谱 |
| `novel.sync.reindex-state` | 重建索引 |

## 7.8 运行时隔离

- 一个工作区对应一个 Bun 服务实例。
- 一个工作区对应一个 Inngest 工作流命名空间。
- 一个工作区在共享 Postgres 实例中对应一个独立 schema。
- 同一本书所有 canonical commit 共享一条串行写入通道。

## 7.9 可靠性约束

- 所有命令都必须携带 `idempotencyKey`。
- 网络错误和 Agent 逻辑错误分开记录。
- 只有 `approve` 或 `override-approve` 可以触发 canonical 写入。
- canonical 保存默认自动触发 `re-sync-state`；如果解析失败，运行时继续使用最后一个有效快照。
- 任何写入 canonical 的步骤完成后都要触发 `re-sync-state`。
- 手工改动经 `re-sync-state` 进入系统时，也要生成一条合成 commit 审计记录。
- 工作区处于 `invalid` 状态时，新的写相关命令必须被拒绝。
- canonical commit 成功后，图谱和检索允许短暂最终一致；运行态需显式区分 `canonicalCommitted` 与 `derivedReady`。