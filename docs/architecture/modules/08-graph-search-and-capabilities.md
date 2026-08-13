# 08. 图谱、检索与能力注册表

## 8.1 图谱定位

React Flow 图谱是派生层，不是第二真相源。

规则：

- 图谱由 canonical Markdown 和派生索引单向生成。
- Web 端默认不能直接拖拽修改 canonical 业务状态。
- `graph/` 只保存布局快照、派生导出和缓存。
- canonical commit 成功后，图谱允许短暂最终一致；UI 必须能表达当前图谱是否已经追平最新 canonical 快照。

## 8.2 节点模型

V1 图谱支持以下节点类型：

- `Chapter`
- `PlotClue`
- `Character`
- `Faction`
- `Location`
- `TechRule`
- `Scene`

其中 `Scene` 基于 outline 中的 canonical 骨架生成，并由正文和索引层补全派生信息。

## 8.3 边模型

推荐最小边集合：

- `introduces`
- `advances`
- `resolves`
- `knows`
- `misunderstands`
- `controls`
- `located-in`
- `depends-on`
- `conflicts-with`
- `uses-tech`

这些边全部由 canonical 状态和派生提取结果生成。

补充规则：`knows` 与 `misunderstands` 边应基于角色认知记录和稳定 `factId` 生成，而不是仅从自然语言表述做模糊推断。

## 8.4 检索策略

### 主策略

- 结构化关系检索优先。
- 向量检索作为补充，不作为唯一事实来源。

### 向量索引范围

只把摘要层送入 `pgvector`：

- 世界设定摘要。
- 角色摘要。
- 章节摘要。
- 伏笔摘要。
- 势力摘要。
- 地点摘要。

不直接把全量正文作为主向量索引单位。

## 8.5 能力注册表

能力注册表是 canonical 配置的一部分，不只是散落配置文件。

### 来源

- 显式注册文件：`state/capabilities/registry.md`
- 补充来源：`mcp.json`、项目内 skill 定义、agent 定义、prompt packs

### 权威关系与发现规则

- `state/capabilities/registry.md` 是能力启用、可见性和允许 Agent 范围的 canonical 权威来源。
- 其他来源只提供“被发现的事实”，例如版本、源位置、可用性和配置哈希。
- 如果扫描到了 registry 中尚未声明的能力，应标记为 `discovered-unregistered` 告警，而不是自动启用。
- 如果 registry 声明了一项能力，但扫描源中根本不存在它，则视为配置错误；所有依赖该能力的 workflow 必须被阻断。

### 建议字段

- `id`
- `type`，例如 `agent`、`skill`、`mcp`、`prompt-pack`
- `source`
- `version`
- `status`
- `visibility`
- `allowedAgents`
- `applicableArtifactTypes`

## 8.6 Agent 能力装配

V1 采用：`静态基线装配 + 任务级少量可选能力`。

### Prompt 覆盖顺序

1. 系统硬规则。
2. 项目级策略。
3. Agent 角色模板。
4. 工件类型模板。
5. 任务参数。

### MCP 开放边界

- `WorldBuilder`、`PlotPlanner`、`Reviewer` 默认只开放有限外部 MCP；V1 的默认外部能力范围为 `cloakbrowser`。
- `Drafter` 默认不拥有广泛 MCP 访问权。
- `Actor` 只读角色账本与相关上下文。

### Skill 参与方式

- 作为受限工作流步骤参与。
- 同时允许作者手工触发专用分析步骤。

## 8.7 版本钉住与 provenance

每次运行都必须记录：

- Prompt 版本。
- Agent 版本。
- Skill 版本。
- MCP 配置版本。
- 参与生成的能力清单。

这套信息进入 proposal 和运行审计，保证“为什么这次结果不同”可以被复盘。