这是一份为你定制的硬核科幻网文创作 Agent 系统架构文档。文档结合了你对 TypeScript、Inngest Durable Workflow、多 Agent 协作（Handoff）的开发习惯，以及全 Markdown 驱动的交付规范，核心旨在通过工程化手段彻底消除 AI 味并解决百万字长文本的幻觉与遗忘问题。
------------------------------
## 🚀 硬核科幻网文创作系统（CyberNovel-Architect）架构文档## 1. 系统概述 (System Overview)
本系统是一个基于 TypeScript 和 Inngest 的多 Agent 协同长篇网文创作系统。系统服务于拥有硬核科学背景的作者，将严谨的天体物理、量子力学、生物工程等底层逻辑，解构并重塑为符合大陆主流网文（如起点中文网）风格的高节奏、无“AI味”的长篇小说。
## 2. 核心设计原则 (Core Design Principles)

   1. 全 Markdown 驱动 (Markdown-Centric)：所有状态、大纲、设定、正文均以 Markdown 格式持久化，便于人类作者进行无缝编辑、版本控制与 Git 管理。
   2. 零 AI 味契合 (Zero AI-Flavor)：通过动态少样本（Few-Shot）网文语料库、强力的消词器（Anti-Buzzwords Filter）及画面化（Show, don't tell）约束，强行格式化文本。
   3. 确定性状态机 (Deterministic Shared State)：使用 Durable Workflow 管理章节依赖，利用 Redis/Git 维护唯一的“全局设定与线索上下文”，杜绝长文逻辑战力崩坏。

------------------------------
## 3. 架构拓扑与数据流 (Architecture Topology & Data Flow)

       +-----------------------------------------------------------+

       |                  人类作者 (Markdown 设定/指令)               |
       +------------------------------+----------------------------+
                                      | (1) 提交设定/触发写作
                                      v
+-------------------------------------+-------------------------------------+

|                      Inngest Durable Workflow Orchestrator                |
|                                                                           |
|   +-------------------+      +-------------------+      +-------------+   |
|   | 1. WorldBuilder   | ---> | 2. PlotPlanner    | ---> | 3. Drafter  |   |
|   |    (硬核科学映射)  |      |    (爽点/大纲重构) |      | (网文风生成)|   |
|   +---------+---------+      +---------+---------+      +------+-+----+   |
|             ^                          ^                       | |        |
|             |                          |                       | |        |
|             | (状态同步与 Handoff 契约) |                       | |(4) 生成 |
|             v                          v                       v v        |
|   +---------+--------------------------+-----------------------+-+----+   |
|   |                  Shared State Manager (Redis / File System)            |   |
|   |   - 伏笔池 (Plot Graveyard)   - 科技等级 (Tech Tree)                   |   |
|   |   - 角色弧光 (Characters)     - 战力控制 (Power Balance)               |   |
|   +------------------------------------+----------------------------------+   |
|                                        ^                                  |
|                                        | (5) 审核反馈                      |
|                                        v                                  |
|                              +---------+---------+                        |
|                              | 4. Reviewer       |                        |
|                              |    (毒舌主编/纠偏) |                        |
|                              +-------------------+                        |
+-------------------------------------|-------------------------------------+
                                      | (6) 最终落盘
                                      v
       +------------------------------+----------------------------+

       |               Output: Local Markdown Workspaces           |
       +-----------------------------------------------------------+

------------------------------
## 4. 多 Agent 协同契约 (Multi-Agent Subsystems)
系统拆分为四个常驻微型 Agent，通过明确的 Router Handoff 契约传递控制权：
## 4.1 WorldBuilder Agent (科学规则解构者)

* 职责：接收作者输入的硬核学术论文、公式或设想，推演其技术边界、社会学效应，生成网文侧的“世界观黄金设定”。
* 输入：作者原始 Markdown 笔记（例如：关于真空衰变或 CRISPR-Cas12 改造的构想）。
* 输出：01_World_Settings/tech_tree.md（明确定义该技术在小说世界的战力、成本、垄断势力、主角外挂契合度）。

## 4.2 PlotPlanner Agent (大纲与爽点操盘手)

* 职责：负责结构化剧情。严控网文节奏，将科学发现转化为“危机 -> 压迫 -> 领悟 -> 逆袭打脸/展现神迹”的网文黄金脉络。
* 核心算法：维护一个 plot_graveyard.md（伏笔池），每次规划新章节，必须从中随机强行提取 1-2 个未回收伏笔交由下一阶段填坑。

## 4.3 Drafter Agent (正文执行器 - 消除 AI 味的核心)

* 职责：执行具体的正文文本编写。
* 执行卡点 (Guardrails)：
* 排版约束：强制输出标准网文排版（单段字数 50 ~ 150 字，全短句，高密度空行）。
   * 消词器拦截：内置 Prompt 级 Regex 过滤，禁止生成任何过渡性、总结性词汇（如：总而言之、不可否认、命运的齿轮、随着时间推移）。
   * 信息密度：删除冗余的形容词，科学细节通过环境、仪器参数、配角侧面震惊来表现，而非旁白平铺直叙。

## 4.4 Reviewer Agent (毒舌主编)

* 职责：模拟真实网文读者与平台审核。
* 检测项：
* AI 味评估：句式重复度、陈词滥调指数。
   * 网文毒点评估：主角是否过度憋屈、科技解释是否变成教科书说明文、节奏是否拖沓。
   * 若不通过，则 Handoff 挂载回 Drafter Agent 并附带具体 Markdown 修改意见重写。

------------------------------
## 5. 数据存储与上下文管理 (Data & Context Schema)
为保证在 100万 ~ 200万 字长线创作中不发生幻觉，上下文采用滑动窗口分层挂载机制：

interface NovelContext {
  bookMeta: {
    title: string;
    genre: "Hard-SciFi" | "Tech-Cyberpunk";
    coreDrive: string; // 主角的终极核心驱动力（防崩盘）
  };
  globalSettings: {
    worldSettingsPath: string;    // 指向 01_World_Settings/
    characterProfilesPath: string; // 指向 02_Characters/
    techTreePath: string;
  };
  dynamicState: {
    currentVolume: number;
    currentChapter: number;
    activePlots: string[];        // 当前正在推进的支线线索
    unresolvedClues: string[];     // 伏笔池未回收项 (From plot_graveyard.md)
    protagonistStatus: {
      techLevel: string;          // 主角当前的科技掌控阶段
      influenceScore: number;     // 主角的社会/星际势力影响力
    };
  };
  rollingWindow: {
    lastThreeChaptersText: string; // 严格限制只前推3章的原文，防止 LLM 被历史长文噪声干扰
    immediatePlotOutline: string;  // 本章细纲
  };
}

------------------------------
## 6. 技术栈选型 (Technology Stack)

* 开发语言：TypeScript (Strict Mode，确保配置项与状态契约的工程严谨性)。
* 异步编排：Inngest (基于事件驱动的 Durable Workflow，天然支持长达数小时的 Agent 状态挂起、人类作者 Re-try 和多步 Handoff 状态机)。
* 底层 Agent 框架：你可以直接封装你的 agent-kit-sill 或是使用轻量级的微软 TypeChat / Vercel AI SDK 用于规范 JSON/Markdown 的结构化输出。
* LLM 路由：
* 大纲规划与逻辑推演 (WorldBuilder, PlotPlanner)：使用高推理能力的模型（如 Claude 3.5 Sonnet / DeepSeek-R1）。
   * 文本批量生成与润色 (Drafter, Reviewer)：使用长上下文、对中文网文语料精调的大模型。

------------------------------
## 7. 核心工作流伪代码 (Core Workflow - Inngest TypeScript)

import { Inngest } from "inngest";import { worldBuilderAgent, plotPlannerAgent, drafterAgent, reviewerAgent } from "./agents";import { loadMarkdownWorkspace, saveChapterToMarkdown } from "./utils/io";
const inngest = new Inngest({ id: "cyber-novel-architect" });
export const generateNewChapterWorkflow = inngest.createFunction(
  { id: "generate-chapter-wf" },
  { event: "novel.chapter.trigger" },
  async ({ event, step }) => {
    // 1. 加载本地 Markdown 状态集
    const context = await step.run("load-context", async () => {
      return await loadMarkdownWorkspace(event.data.workspacePath);
    });

    // 2. WorldBuilder 校验：是否有新的硬核科学设定需要注入
    const updatedSettings = await step.run("world-build-sync", async () => {
      return await worldBuilderAgent.syncScienceSettings(context);
    });

    // 3. PlotPlanner 规划：生成本章细纲，强行从伏笔池抽卡
    const chapterPlan = await step.run("plot-planning", async () => {
      return await plotPlannerAgent.generateChapterOutline(updatedSettings);
    });

    // 4. Drafter & Reviewer 状态循环：不消除 AI 味绝不罢休
    let draftApproved = false;
    let currentDraft = "";
    let reviewFeedback = "";
    let attempt = 0;

    while (!draftApproved && attempt < 3) {
      attempt++;
      
      // 生成正文
      currentDraft = await step.run(`generate-draft-v${attempt}`, async () => {
        return await drafterAgent.writeChapter(chapterPlan, reviewFeedback);
      });

      // 评审正文（主编视角）
      const reviewResult = await step.run(`review-draft-v${attempt}`, async () => {
        return await reviewerAgent.audit(currentDraft, chapterPlan);
      });

      draftApproved = reviewResult.approved;
      reviewFeedback = reviewResult.feedback;
    }

    // 5. 持久化落盘为作者习惯的 Markdown 格式
    await step.run("save-and-flush", async () => {
      await saveChapterToMarkdown(event.data.workspacePath, currentDraft, chapterPlan);
    });

    return { status: "success", chapter: chapterPlan.chapterNumber };
  }
);

------------------------------
## 下一步行动指南 (Next Steps)
为了让你能快速用 TypeScript 将其跑起来，建议我们挑选核心突破点。你可以选择：

   1. 实现消词器与网文节奏 Prompt（Drafting Module）：编写具体的 System Prompt，针对你的硬核科幻场景，做一组“AI味 vs 起点风”的 Few-shot 转换样本。
   2. 实现 Inngest 共享状态与伏笔池契约（Workflow Module）：细化 plot_graveyard.md 的读写与状态 Handoff 的 TypeScript 类型定义。


