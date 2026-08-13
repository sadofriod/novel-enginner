# 02. Canonical Workspace

## 2.1 工件分层

| 层级 | 定义 | 例子 |
| --- | --- | --- |
| canonical | 系统唯一真相源，进入 Git 版本管理 | `state/characters/*.md`、`manuscript/**/*.md` |
| proposal | 待审批候选工件，默认留在 Postgres 审计层 | 单章细纲提案、正文草稿、角色更新提案 |
| derived | 可由 canonical 重建，不应反向成为权威 | `graph/` 布局、向量摘要、运行缓存 |

规则：proposal 在审批通过前默认不写入 canonical Markdown。需要人工继续深改时，可以导出到 `drafts/`。

## 2.2 推荐目录布局

```text
docs/
  PRDs/
  architecture/
state/
  book/
    book.md
  volumes/
    volume-001.md
  chapters/
    chapter-0042-outline.md
  characters/
    char-lin-mo.md
  facts/
    fact-diode-origin-001.md
  relationships/
    rel-lin-mo-third-security-bureau-hostile.md
  resources/
    res-lab-terminal-01.md
  factions/
    faction-third-security-bureau.md
  locations/
    location-mars-ruins.md
  tech-rules/
    tech-quantum-entanglement-comm.md
  plot-clues/
    clue-mars-diode-001.md
  planning-anchors/
    pa-hidden-origin-payoff.md
  capabilities/
    registry.md
  vocabularies/
    registry.md
  reviewer/
    rules.md
manuscript/
  volume-001/
    chapter-0042.md
prompts/
  project/
  agents/
  artifact-types/
  chapter-types/
graph/
  layouts/
  exports/
runtime/
  logs/
  cache/
drafts/
  exported/
assets/
  references/
```

## 2.3 Git 跟踪策略

默认纳入 Git：

- `docs/`
- `state/`
- `manuscript/`
- `prompts/`

默认不纳入 Git：

- `runtime/`
- `graph/`
- 大多数 `drafts/`

说明：`graph/` 和 `runtime/` 属于派生或运行产物。`drafts/` 只用于少量人工导出的候选工件，不作为系统历史主存储。

## 2.4 文件命名约定

| 类型 | 命名规则 |
| --- | --- |
| Volume | `volume-001.md` |
| Chapter Outline | `chapter-0042-outline.md` |
| Chapter Manuscript | `chapter-0042.md` |
| Character | `char-{slug}.md` |
| Fact | `fact-{slug}.md` |
| Relationship | `rel-{slug}.md` |
| Resource | `res-{slug}.md` |
| Faction | `faction-{slug}.md` |
| Location | `location-{slug}.md` |
| TechRule | `tech-{slug}.md` |
| PlotClue | `clue-{slug}.md` |

约束：

- slug 使用稳定 kebab-case。
- 章节编号按整本书全局递增，`volumeId` 单独存储，不在章节主 ID 中重置。
- 工件 ID 与文件名一一对应。
- 稳定 ID 一旦建立，不因显示名称变化而改写。
- 关系字段使用稳定 ID，而不是自由文本名称。

## 2.5 Markdown 契约

### 结构规则

- `frontmatter` 承载所有必须被解析、校验和索引的字段。
- 机器强依赖的复杂结构优先放在 `frontmatter` 的嵌套结构中，而不是散落在正文描述里。
- 正文 section 用于人类说明、设计 rationale 和自由补充信息。
- 解析器只信任 `frontmatter` 和固定标题 section，不依赖任意自由叙述恢复关键状态。

### 示例：Book

```md
---
id: book-quantum-ascension
title: 量子飞升
status: active
activeVolumeId: volume-001
latestCanonicalVersion: snap-book-001-20260812-01
globalPromises:
  - promise-tech-escalation-with-cost
  - promise-hidden-origin-payoff
globalConstraints:
  - constraint-no-ftl-without-anchor
  - constraint-single-pov-per-scene
defaultChapterTypePolicy:
  maxConsecutiveSamePrimaryType: 2
---

# Summary

书级导航、长期承诺与总约束统一挂在这里。
```

### 示例：Volume

```md
---
id: volume-001
title: 火星废墟卷
status: active
sequenceNumber: 1
goal: 建立火星遗迹主线并完成第一轮科技跃迁
stage: escalation
chapterRoster:
  - chapter-0040
  - chapter-0041
  - chapter-0042
targetChapterCount: 12
requiredCluePayoffs:
  - clue-mars-diode-001
milestones:
  - ms-volume-001-lab-breach
  - ms-volume-001-diode-awakening
---

# Summary

卷级编排、章节 roster 与里程碑在这里保持可校验。
```

### 示例：Character

```md
---
id: char-lin-mo
name: 林默
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
status: active
knowledgeLedger:
  - factId: fact-diode-origin-001
    beliefState: known
    sourceRef: scene-0041-terminal-breach
    chapterAcquired: 41
    visibility: actor-known
    confidence: 0.92
relationshipIds:
  - rel-linmo-third-security-bureau-hostile
resourceIds:
  - res-lab-terminal-01
---

# Summary

角色当前阶段为技术驱动型求生者。

# Notes

这里允许记录不参与强校验的人类备注。
```

### 示例：Chapter Outline

```md
---
id: chapter-0042-outline
chapterNumber: 42
displayTitle: 火星遗迹的错误答案
volumeId: volume-001
chapterType: reveal
chapterTypeTags:
  - pressure
  - action
status: approved
targetWordCount: 3200
activeClueIds:
  - clue-mars-diode-001
resolveClueIds:
  - clue-red-file-001
introduceClueIds:
  - clue-nonhuman-dna-001
sceneSkeleton:
  - id: scene-0042-lab-entry
    purpose: intrusion
    locationId: location-mars-ruins
    participantCharacterIds:
      - char-lin-mo
  - id: scene-0042-diode-test
    purpose: reveal
    locationId: location-mars-ruins
    participantCharacterIds:
      - char-lin-mo
emotionCurveStageIds:
  - ec-0042-rise
  - ec-0042-pressure
  - ec-0042-counter
  - ec-0042-reveal
  - ec-0042-hook
---
```

### 示例：Chapter Manuscript

```md
---
id: chapter-0042
chapterNumber: 42
displayTitle: 火星遗迹的错误答案
volumeId: volume-001
basedOnOutlineId: chapter-0042-outline
status: approved
basedOnCanonicalVersion: snap-book-001-20260812-01
sceneAnchorIds:
  - scene-0042-lab-entry
  - scene-0042-diode-test
---

# Scene scene-0042-lab-entry

林默贴着残损实验室外墙向前摸进。

# Scene scene-0042-diode-test

二极管重新点亮的瞬间，错误的结论先于真相抵达。
```

## 2.6 手工修改回流

- 作者允许直接手改 canonical Markdown。
- 保存后默认自动进入 `re-sync-state`；连续保存聚合为编辑会话级 synthetic commit，而不是每次保存都单独记账。
- 任何手工改动要经过 `re-sync-state` 校验后才算正式进入运行时索引。
- 如果某次保存导致 schema 解析失败，文件仍保留在工作区，但运行时继续信任最后一个有效快照；工作区进入 `dirty` / `invalid` 状态。
- 工作区处于 `dirty` / `invalid` 状态时，新的写相关命令与 canonical commit 必须被阻断。
- 作者对已批准 `chapter-outline` / `chapter-manuscript` 的直改，在成功通过 `re-sync-state` 后直接成为新的 canonical 内容；旧 review 同步转为过期，并异步触发 synthetic review。
- `re-sync-state` 负责重新解析、重建摘要、刷新 graph 和 search 索引；其中 graph/search/embedding 允许异步追平。

## 2.7 Proposal 持久化规则

- 未确认的世界观变更、分卷大纲、单章细纲、正文草稿、状态更新提案默认保存到 Postgres 审计层。
- proposal 是一等、不可变的审计实体，而不是 run 的临时附属记录。
- proposal 共享统一生命周期；不同 `artifactType` 只扩展字段，不扩展主状态机。
- proposal 自身保持轻量；完整 `ReviewerResult` 与 `OverrideAudit` 作为独立、不可变的审计实体持久化，proposal 只保留引用。
- 每个 proposal 至少记录 `proposalId`、`artifactType`、`targetId`、`basedOnCanonicalVersion`、`parentRunId`、`supersedesProposalId`、`status`，并可附带 `entityVersionRefs`、`latestReviewResultId` 和 `overrideAuditId`。
- 同一 `artifactType + targetId` 再次发起 `propose` 或 `regenerate` 时，新 proposal 会自动 supersede 旧的活跃 proposal。
- `basedOnCanonicalVersion` 一旦落后于当前书级快照，proposal 就不能直接进入批准落盘路径，必须先重新生成、重新 review 或转人工深改后回流。
- 需要人工深度改写时，才导出到 `drafts/exported/`。
- `export-draft` 是 proposal 的显式终态动作；人工深改后的内容重新回流时，必须创建新的 proposal，而不是复用旧 proposal。
- 一旦 proposal 被批准，且工作区干净有效，其结果再回写到 canonical Markdown；若工作区无法落盘，则 proposal 进入 `commit-blocked` / `waiting-sync` 状态，待工作区恢复后再由作者确认继续。

### 示例：Proposal Frontmatter

当 proposal 被导出到 `drafts/exported/` 供人工深改时，推荐使用如下最小 frontmatter：

```md
---
proposalId: proposal-chapter-0042-002
artifactType: chapter-manuscript
targetId: chapter-0042
status: pending-approval
intent: propose
basedOnCanonicalVersion: snap-book-001-20260812-01
parentRunId: run-chapter-0042-001
supersedesProposalId: proposal-chapter-0042-001
entityVersionRefs:
  - entityId: char-lin-mo
    version: snap-char-lin-mo-20260812-02
latestReviewResultId: review-proposal-chapter-0042-002
bundledDiffRefs:
  - diff-character-char-lin-mo-techlevel
  - diff-plotclue-clue-mars-diode-001
---

# Proposal Content

这里放待审批正文或结构化 patch 的人工可读版本。
```