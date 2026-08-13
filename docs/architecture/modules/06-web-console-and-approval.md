# 06. Web 控制台与审批流

## 6.1 角色定位

Web 控制台不是主写作面板，而是：

- proposal 触发面。
- 审批面。
- 运行追踪面。
- 图谱可视化面。

## 6.2 主视图

- `任务/审批队列`
- `剧情图谱`
- `工件详情`
- `运行追溯`

## 6.3 审批单位

审批单位是单个 proposal 工件，而不是整次运行或整个章节打包审批。

说明：某些 proposal 会携带结构化附属 diff，例如 `chapter-manuscript` 通过时附带的 `character-update`（宿主 mutable fields）、`fact-update`、`relationship-update`、`resource-update`、`plot-clue`、`faction/location/tech-rule` 变更；这些 diff 属于同一个 proposal 的提交内容，而不是额外碎片审批单。

示例：

- 一个世界观变更提案。
- 一个分卷大纲提案。
- 一个单章细纲提案。
- 一个正文草稿。
- 一个角色状态更新提案。

## 6.4 V1 支持的 `artifactType`

| artifactType | 默认预算 | 备注 |
| --- | --- | --- |
| `world-change` | `2000-4000` 字 | 影响分析型提案 |
| `volume-outline` | `3000-5000` 字 | 卷级设计文档 |
| `chapter-outline` | `400-800` 字 | 单章结构化细纲 |
| `chapter-manuscript` | 默认 `2500-4000` 字，可覆写到 `1500-5000` | 正文草稿 |
| `character-update` | `200-600` 字 | 结构化状态变化提案 |
| `faction-update` | `200-600` 字 | 同上 |
| `location-update` | `200-600` 字 | 同上 |
| `tech-rule-update` | `200-600` 字 | 同上 |
| `fact-update` | `200-600` 字 | 共享事实提案 |
| `relationship-update` | `200-600` 字 | 通用跨实体关系提案 |
| `resource-update` | `200-600` 字 | 通用跨实体资源提案 |

规则：每次 Web 端操作必须显式选择 `artifactType`，不能依赖系统猜测。

补充规则：宿主聚合导向的 update 只用于宿主自身 mutable fields；共享事实、关系、资源变更必须走 `fact-update`、`relationship-update`、`resource-update`。

## 6.5 审批动作

- `approve`
- `reject`
- `override-approve`
- `export-draft`
- `delete`

### 动作语义

- `approve`：工作区干净有效时写入 canonical，并触发 re-sync；如果 proposal 携带附属状态 diff，则与主工件原子提交；若工作区无法安全落盘，则进入 `commit-blocked` / `waiting-sync`。
- `reject`：返回对应 Agent 或人工继续修改。
- `override-approve`：带风险审计强制通过，但不能越过结构一致性错误。
- `export-draft`：导出到 `drafts/exported/`，并将原 proposal 置为 `exported` 终态，后续回流必须创建新 proposal。
- `delete`：丢弃该 proposal，不写入 canonical。

## 6.6 内联编辑边界

- Web 端允许有限微调，例如结构字段、批注、少量短文本修正。
- V1 允许修改 proposal 的结构字段、scene / emotion 结构、批注，以及总计不超过约 `200` 汉字的短文本微修。
- 任何内容性微调都会使旧 review 失效，并触发重新 review。
- 长篇正文和复杂设定改写应导出到 `drafts/` 或回到 VS Code。
- Web 端不应演化为第二主编辑器。

## 6.7 队列优先级

审批队列默认按以下顺序排序：

1. 阻塞主流程程度。
2. 工件类型权重。
3. 最近更新时间。

典型高优先级项目：

- 会阻塞章节继续推进的 `chapter-outline`。
- 世界观变更提案。
- 存在硬失败但等待作者决策的 `chapter-manuscript`。

## 6.8 工件详情页

工件详情页默认显示：

- proposal 内容。
- `proposal vs canonical` 差异视图。
- `basedOnCanonicalVersion` 与 proposal 生命周期状态。
- `entityVersionRefs`、`latestReviewResultId`、`overrideAuditId`（如存在）。
- `commit-blocked` / `waiting-sync` 状态与 `review-stale` 风险标记（如存在）。
- bundled state diff / patch set 预览。
- Reviewer 结构化结果。
- 关联运行记录。
- 关联章节、角色、伏笔、场景。

## 6.9 审批后反馈

批准后默认执行：

1. 工作区干净有效时写入 canonical Markdown；否则 proposal 进入 `commit-blocked` / `waiting-sync`。
2. 成功落盘后触发 `re-sync-state`。
3. 刷新图谱和审批队列。
4. 返回可跳转到 VS Code 文件的定位信息。

## 6.10 本地信任边界

- Web 控制台 V1 默认不做登录和权限体系。
- 它被视作本地作者自己的受信任界面。
- 一旦进入远程部署或多用户，再独立设计鉴权层。