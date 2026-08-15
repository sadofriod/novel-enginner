# 05 Graph、Search 与派生层

## 1. Graph

`graph/derive.ts` 从 `WorkspaceSnapshot` 纯函数构建 `DerivedGraph`。节点包括 Chapter、PlotClue、Character、Faction、Location、TechRule、Scene；边包括 introduces、advances、resolves、knows、misunderstands、controls、located-in、depends-on、conflicts-with、uses-tech、relates-to。`Character.knowledgeLedger` 可生成 knows/misunderstands，PlanningAnchor 不进入主图节点但会进入搜索文档。

graph 带 snapshot provenance，watcher sync 会在数据库可用时记录 `DerivedRebuildJob`，并执行 `rebuildDerivedSearchIndex()`。

## 2. Search 与 embedding

`embedding-dispatch.ts` 提供 summary-only SearchDocument 重建、hash 增量更新、pending embedding 列表和批处理；`vector-search.ts` 负责 pgvector 写入和 cosine similarity 查询。SearchDocument 通过 `(workspaceId, bookId, documentId)` 唯一，embedding 维度固定为 1536，并用 `embedded` 标识异步状态。

## 3. 当前边界

- 没有面向 Web/CLI 的 search API。
- 没有面向 Agent 的统一 search facade，也没有 graph query 与 vector query 的统一编排。
- `processPendingEmbeddings()` 没有出现在 `inngestFunctions` 注册列表中，embedding provider/worker/队列未形成完整运行链。
- 摘要文本目前偏向 `${kind}: ${label}`，不是完整的领域摘要；`SUMMARY_ELIGIBLE_KINDS` 不覆盖架构要求的所有世界设定/科技规则种类。
- `deriveChapterOutlineSceneEdges()` 使用 knows 语义生成角色到 scene 的边，和 knowledge ledger 语义存在过载风险。
- `vectorSearch()` 使用 raw SQL，limit 虽经过数值归一化，仍应在统一查询层明确安全边界。

## 4. 与架构文档的关系

“派生结果可重建、不能成为真相源”已经较好落地；“结构化关系优先、摘要层向量检索、受控异步 embedding、对外查询入口”仍是目标设计。当前 graph UI 只证明了展示链路，不等于搜索和 Agent 检索链路完成。

## 5. 测试

已有 `derive.test.ts`、`planning-anchor.test.ts`、`embedding-dispatch.test.ts` 和 `embedding-provider.test.ts`。缺少 workspace/book 隔离的查询集成、embedding worker、重试、索引重建后的 API 结果和大数据量性能测试。