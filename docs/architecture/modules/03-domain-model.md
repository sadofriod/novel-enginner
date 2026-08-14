# 03. 领域模型

## 3.1 核心聚合

| 聚合 | 权威性 | 说明 |
| --- | --- | --- |
| Book | canonical | 总体设定、书籍级策略、工作区级约束 |
| ProjectBrief | canonical | 创作定位、读者承诺、市场研究证据与待验证假设 |
| WorldFoundation | canonical | 不可违反的世界硬规则与最小设定约束 |
| StoryBlueprint | canonical | 主线、终局、卷级功能和跨卷承诺 |
| Volume | canonical | 卷目标、阶段推进、卷级回收计划 |
| Chapter Outline | canonical | 章级结构、情绪曲线、场景计划、伏笔计划 |
| Chapter Manuscript | canonical | 最终正文 |
| Character | canonical | 人设核心、可变状态、知识账本 |
| Fact | canonical | 可被多聚合和多角色复用的共享事实本体 |
| Relationship | canonical | 通用跨实体关系，作为关系真相源 |
| Resource | canonical | 通用跨实体资源，作为资源真相源 |
| TechRule | canonical | 科技树规则、前置条件、成本与上限 |
| PlotClue | canonical | 伏笔生命周期和可见性 |
| Faction | canonical | 势力目标、资源和敌对关系 |
| Location | canonical | 地点访问规则、风险和控制者 |
| Scene | canonical skeleton + derived enrichment | 在细纲中声明骨架，再由正文和索引补全，用于图谱、索引和节奏映射 |

规则：所有带 `status` 的聚合都必须拥有显式状态机，禁止把 `status` 当自由文本备注。

## 3.1.1 启动期全书工件

`ProjectBrief`、`WorldFoundation` 与 `StoryBlueprint` 是 Book 之外的独立 canonical 聚合，不能把完整内容回填进 `Book` 或复用 `world-change` patch set。

- `ProjectBrief` 记录题材、目标读者、读者承诺、核心前提、开篇钩子、内容边界、作品形态、研究证据 ID 与待验证假设。
- `WorldFoundation` 记录时代与主舞台、现实模式、基调、能力/技术体系、不可违反规则、社会秩序、叙事禁区、术语引用和 `projectBriefRef`。
- `StoryBlueprint` 记录 `projectBriefRef`、`worldFoundationRef`、主角弧光、核心冲突、对立面、终局方向、卷级计划与跨卷承诺。

三者都允许 `extensions`，但不得把流程依赖字段隐藏在自由 Markdown 或扩展对象中。完整字段与 bootstrap 阶段合同见 11。

## 3.1.1 Book

`Book` 不只是背景设定文档，而是全局导航和总约束的权威聚合。V1 至少记录：

- `id`
- `title`
- `status`
- `activeVolumeId`
- `latestCanonicalVersion`
- `globalPromises`
- `globalConstraints`
- `defaultChapterTypePolicy`

补充规则：`globalPromises` 与 `globalConstraints` 直接指向 `PlanningAnchor` ID，分别对应 `kind=promise` 与 `kind=constraint`。

## 3.1.2 Volume

`Volume` 是显式编排单元，而不是仅供阅读的目标描述。V1 至少记录：

- `id`
- `title`
- `status`
- `sequenceNumber`
- `goal`
- `stage`
- `chapterRoster`
- `targetChapterCount`
- `requiredCluePayoffs`
- `milestones`

补充规则：`stage` 取值来自项目级受控词表；`milestones` 指向 `PlanningAnchor` ID，且对应 `kind=milestone`。

## 3.1.3 PlanningAnchor

`PlanningAnchor` 是 Book / Volume 级规划锚点的统一轻量实体，用于承载原先悬空的 promise、constraint 与 milestone 引用。

V1 最小字段：

- `id`
- `kind`，例如 `promise`、`constraint`、`milestone`
- `title`
- `status`
- `ownerRef`
- `summary`
- `relatedClueIds`
- `targetChapterIds`

规则：

- `PlanningAnchor` 使用共享最小状态机，例如 `active`、`satisfied`、`superseded`、`archived`。
- 它是 canonical 实体，但 V1 不作为独立图节点进入主图谱，而是用于 Book / Volume 引用、详情页展示和派生摘要。

## 3.2 Character

### 固定字段

- `coreMotivation`
- `worldview`
- `baselinePersonality`
- `hardConstraints`

### 可变字段

- `knowledgeLedger`
- `relationshipIds`
- `resourceIds`
- `goalState`
- `injuryState`
- `techLevel`

规则：`update-actor` 只允许修改可变字段，不能直接改写核心动机、底层人格和世界观立场。

补充规则：`relationshipIds` 与 `resourceIds` 在 V1 直接指向顶层 canonical `Relationship` / `Resource` 工件；`Character` 上保留的是导航与行为推演所需引用，不是关系或资源的权威来源。

补充规则：`worldview` 与 `techLevel` 都来自项目级受控词表。

## 3.3 Fact、Relationship、Resource 与 Character 知识账本

共享事实本体、跨实体关系、共享资源与角色认知记录是四层结构，不能混成自由文本备注。

### 通用跨实体引用模型

- V1 的跨实体引用统一采用带类型前缀的稳定 ID 字符串，例如 `char-*`、`fact-*`、`location-*`、`faction-*`。
- 不引入额外的 `{ entityType, entityId }` 包装对象作为 canonical 引用格式。
- 解析器必须基于 ID 前缀和目标实体存在性做强校验。

### Fact

- `Fact` 在 V1 直接作为顶层 canonical 聚合保存到 `state/facts/`。
- 每条 `Fact` 至少记录 `id`、`statement`、`sourceRef`、`visibility`、`status`。
- `Fact` 使用通用跨实体引用模型；多个 `Character`、`Faction`、`Location`、`TechRule`、`Chapter Outline` 都可以引用同一条事实。
- `Fact.visibility` 的取值来自项目级受控词表，并与角色认知账本使用同一套世界内可见性语义。

### Relationship

- `Relationship` 在 V1 直接作为顶层 canonical 聚合保存到 `state/relationships/`。
- 每条 `Relationship` 至少记录 `id`、`sourceRef`、`targetRef`、`relationType`、`status`。
- `Relationship` 是跨实体关系的唯一 canonical 真相源；`Faction`、`Character` 等宿主聚合只保留 `relationshipIds` 或派生摘要，不再保留第二份权威关系矩阵。
- `relationType` 的取值来自项目级受控词表。

### Resource

- `Resource` 在 V1 直接作为顶层 canonical 聚合保存到 `state/resources/`。
- 每条 `Resource` 至少记录 `id`、`name`、`resourceType`、`ownerRef`、`holderRef`、`status`。
- 宿主聚合只保留 `resourceIds`；资源详情由顶层 `Resource` 统一承载。
- `resourceType` 的取值来自项目级受控词表。

### Character 认知账本

角色已知信息不是自由文本，而是结构化事实账本；其 canonical 字段名固定为 `knowledgeLedger`。每条事实至少包含：

- `factId`
- `beliefState`，例如 `known`、`suspected`、`misunderstood`
- `sourceRef`
- `chapterAcquired`
- `visibility`
- `confidence`

这套账本用于 `Actor` 推演角色在当前知识边界下是否会做出某个行为。

补充规则：`BeliefRecord.visibility` 与 `Fact.visibility` 共享同一套世界内可见性词表。

## 3.4 Faction 与 Location

### Faction 最小字段

- `id`
- `name`
- `type`
- `goal`
- `resourceIds`
- `relationshipIds`
- `knownByCharacters`
- `status`

### Location 最小字段

- `id`
- `name`
- `type`
- `parentLocation`
- `controlFaction`
- `hazards`
- `accessRules`
- `status`

补充规则：`Faction.type` 与 `Location.type` 的取值来自项目级受控词表。

## 3.5 TechRule

TechRule 是一等权威实体，因为 `科技树越级` 是硬失败项。V1 至少记录：

- `id`
- `name`
- `tier`
- `preconditions`
- `costs`
- `limits`
- `allowedEffects`
- `status`

补充规则：`tier` 的取值来自项目级受控词表。

## 3.6 Chapter 类型体系

### 主类型

- `progress`
- `pressure`
- `action`
- `reveal`
- `payoff`
- `turn`
- `transition`

规则：V1 中 `chapterType` 与辅助标签词表默认封闭，不允许在项目运行时任意扩展。

### 标注规则

- 每章必须有一个主类型。
- 每章最多两个辅助标签。
- 同一主类型默认最多连续两章。
- `chapterTypeTags` 在 V1 只作为描述性提示，不参与硬门禁、核心调度或评分权重主计算。

### 类型驱动默认值

章节类型不是标签装饰，而是驱动这些默认配置：

- 正文字数预算
- 情绪曲线模板
- 伏笔引入/推进/回收配额
- Reviewer 评分权重微调

## 3.7 情绪曲线

### 结构

- 情绪曲线是单章细纲必填字段。
- 默认采用五段骨架，允许四到六段变体。
- 每一段都必须映射到一个或多个 `Scene`。

### 默认五段骨架

1. `rise`
2. `pressure`
3. `counter`
4. `reveal-or-turn`
5. `hook`

### 每段必填字段

- `id`
- `stageType`
- `emotionIntensity`，范围 `1-5`
- `targetReaderEffects`
- `sceneIds`
- `summary`

### `targetReaderEffects` 受控词表

- `pressure`
- `confusion`
- `anticipation`
- `shock`
- `payoff`
- `unease`
- `fear`
- `pity`
- `ignite`

## 3.8 PlotClue

### 生命周期

`PlotClue` 采用以下最小状态机：

- `candidate`
- `introduced`
- `active`
- `escalated`
- `suppressed`
- `resolved`
- `invalidated`

### 关键字段

- `id`
- `title`
- `introducedInChapter`
- `currentStatus`
- `resolveTargetVolume`
- `readerVisibility`
- `knownByCharacterIds`
- `misledCharacterIds`
- `dependencyClueIds`
- `conflictClueIds`

补充规则：`readerVisibility` 使用独立的读者侧可见性词表，而不是复用 `Fact.visibility` / `BeliefRecord.visibility`。

### 默认章节配额

- 新引入：`0-2`
- 推进：`1-3`
- 回收：`0-1`

规则：关键章节至少回收一个已存在伏笔。

### 陈旧告警

- 任一伏笔如果连续十二章未推进、未升级、未回收，应进入 derived 的 `stale` 风险视图。
- `stale` 不是 `PlotClue` 主状态机的一部分，而是派生风险标记。
- 被标为 `stale` 的伏笔在后续 PlotPlanner 规划中要被优先考虑。

## 3.9 Scene

- Scene 在 V1 采用“canonical 骨架 + derived 补全”的混合模式。
- Chapter Outline 必须声明 scene 骨架，正文和索引层在此基础上补全节奏、摘要和图谱信息。
- Scene 必须拥有稳定 ID；推荐规则：`scene-{chapterNumber}-{slug}`。
- Chapter Manuscript 必须保留可解析的 scene 锚点，不能完全依赖事后 NLP 切分。
- V1 固定使用 Markdown 标题锚点 `# Scene {sceneId}` 标记正文中的 scene 边界。
- `entryState` 与 `exitState` 是机器可读的场景状态切片，不是开放式任意对象。
- V1 的场景状态切片采用两层结构：`participantStates` 与场景级状态。
- `participantStates` 按角色 ID 收口，至少承载 `locationDetail`、`injuryState`、`goalState`、`heldResourceIds`、`knowledgeDeltaFactIds`。
- 场景级状态至少承载 `activeClueIds`、`constraintIds`、`threatLevel`。
- 这些字段只记录与当前场景强相关的变化切片，不追求全量世界状态快照。

### Scene 骨架最小字段

- `id`
- `purpose`
- `locationId`
- `participantCharacterIds`
- `entryState`
- `exitState`

补充规则：`purpose` 的取值来自项目级受控词表。

## 3.10 Outline 与 Manuscript 合同

- `Chapter Manuscript` 必须显式绑定一个已批准的 `Chapter Outline`。
- `Chapter Outline` 与 `Chapter Manuscript` 都可包含可选的 `displayTitle` 字段。
- 如果 outline 与 manuscript 同时提供 `displayTitle`，则它们默认必须一致；如需变更，应回到 outline/proposal 层同步处理，或由同次 proposal 原子更新。
- 文案级、局部节奏级的小漂移允许在正文阶段处理。
- 一旦偏离 `scene` 边界、`emotionCurve` 骨架、`clue` 引入/回收计划或章节主类型，必须先回到 outline 层形成新的 proposal。