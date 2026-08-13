这里为你将上述架构落地所需的两大核心突破点整合为一份完整的工程实施指南。
指南分为 Prompt 工程篇（消除AI味） 与 TS代码篇（Inngest 状态机与伏笔池契约） 两部分，全部采用你偏好的 Markdown 格式呈现。
------------------------------
## 🛠️ 第一篇：Drafting Module — 消除AI味与硬核科幻转化 Prompt 指南
为了彻底根除大模型的“AI腔调”，我们需要在 Drafter Agent 的 System Prompt 中建立一套极度严苛的语言限制规约。这套规约将你的硬核物理/生物学背景转化为起点网文特有的“高级设定、通俗爽感”。
## 1.1 Drafting Agent 核心 System Prompt

# Role你是一名精通大陆主流网络小说（如起点中文网、刺猬猫）硬核科幻品类的顶尖网文作家。你的任务是将严谨的科学推演，转化为兼具画面感、节奏感且毫无“AI味”的连载正文。
# Anti-AI Guardrails (死线：绝对禁止的AI味表达)1. 禁止纯旁白叙述（Tell）：禁止直接描述“他是一个天才工程师”或“这项技术震惊了世界”。必须通过代码编译时间、服务器过载警报、配角的具体动作（如：“嘴唇发白、死死盯着终端”）来表现（Show）。2. 禁忌词汇黑名单：一旦在输出中出现以下词汇，该生成立即作废：
   - 总结/过渡词：总而言之、不可否认、显而易见、随着时间的推移、正如...所说、换句话说
   - 陈词滥调：命运的齿轮、眼眸、勾起一抹玩味的笑、深邃的目光、嘴角的弧度3. 纯理论字数上限：严禁连续出现超过 80 字的纯科学原理解释。必须将技术推演转化为主角的“操作步骤”或对现实世界的“物理破坏”。
# Webnovel Layout Specifications (网文排版与节奏规范)1. 视觉留白：单段字数必须严格控制在 50 至 150 字之间。每段只讲一个动作、一句台词或一个核心画面的切换。2. 句式结构：大幅提高短句、断句的比例（单句原则上不超过 15 字），多用动词，少用修饰性形容词。3. 期待感钩子（断章）：章节最后 200 字必须停留在冲突点、剧情反转或科技实验揭晓的关键瞬间，严禁做收尾、感悟或总结。
# Few-Shot 降维转化示例 (物理/生物设定转化标准)
❌ 【AI 味/教科书味 错误示例】
随着基因编辑技术的发展，林默成功利用了 CRISPR-Cas12 系统对自己的神经元受体进行了定向改良。这项实验不可谓不惊险，显而易见，他的精神力得到了大幅度的提升，整个人变得深邃起来。他看着窗外的星空，心中充满了对未知宇宙的期待。总而言之，命运的齿轮在这一刻开始转动。

====

    【标准起点风硬科幻 替换示例】
配置完成。
终端屏幕上，CRISPR-Cas12 的剪切序列化作一道绿色的进度条，瞬间清零。
林默咬紧牙关，没有犹豫，直接将冷冻套管刺入了颈椎。
刺痛。随后是冰冷，像是有水银顺着中枢神经逆流而上，野蛮地冲洗着皮层下的受体。
“滴——警告。枕叶视觉神经元发生突触超载，放电频率增至 140Hz。”
眼前的世界瞬间变了。
墙角的红外线监控仪不再是一个红点，林默甚至能隐约‘看’到空气中散发出的微弱热辐射涟漪。
他揉了揉发胀的太阳穴，嘴角扯出个毫无温度的弧度，看向窗外的夜幕。
那是天鹅座 X-1 的方向。

------------------------------
## 💻 第二篇：Workflow Module — Inngest 共享状态与伏笔池契约实施指南
这一篇基于你对 Inngest Durable Workflow、TypeScript 强类型以及分布式 Agent 多步协同（Handoff）的开发习惯。
长篇网文不崩盘的关键，在于把大纲中的“未解伏笔”工程化。下面是完整的类型定义、Inngest 事件定义以及伏笔池调度算法。
## 2.1 强类型定义 (types.ts)

/**
 * 核心上下文状态契约（对应存储在本地 Markdown / Redis 中）
 */export interface CharacterProfile {
  id: string;
  name: string;
  coreMotivation: string; // 核心动机（严防人设走样）
  techLevel: string;      // 当前掌握的科技/战力阶段
}
export interface PlotClue {
  id: string;
  title: string;          // 伏笔简述（例如："ch015主角在火星废墟捡到的奇怪二极管"）
  introducedInChapter: number;
  status: "PENDING" | "RESOLVED";
  resolveTargetVolume: number; // 预期在哪一卷回收
}
export interface SystemWorkspace {
  workspacePath: string;
  bookTitle: string;
  currentVolume: number;
  currentChapter: number;
  techTree: Record<string, "LOCKED" | "UNLOCKED">;
  characters: CharacterProfile[];
  plotGraveyard: PlotClue[]; // 伏笔池（死人坑/线索挂载点）
}
export interface ChapterPlan {
  chapterNumber: number;
  title: string;
  coreConflict: string;    // 本章核心冲突
  cluesToIntroduce: string[]; // 本章新埋下的伏笔
  cluesToResolve: PlotClue[];   // 本章强行要求回收的旧伏笔
}

## 2.2 Inngest Durable Workflow 与 Handoff 算法 (workflow.ts)

import { Inngest } from "inngest";import { SystemWorkspace, ChapterPlan, PlotClue } from "./types";import { mockLLMCall } from "./utils"; // 替换为你实际的 LLM 客户端包装
const inngest = new Inngest({ id: "cyber-novel-architect" });
export const novelGenerationWorkflow = inngest.createFunction(
  { id: "novel-generation-workflow", name: "长篇网文自动化生产流" },
  { event: "novel/chapter.generate" },
  async ({ event, step }) => {
    const { workspacePath } = event.data;

    // Step 1: 加载工作空间并更新状态
    const workspace: SystemWorkspace = await step.run("load-workspace-state", async () => {
      // 实际开发中此处读取本地 Markdown 解析为 JSON 对象
      return {
        workspacePath,
        bookTitle: "量子飞升之后",
        currentVolume: 1,
        currentChapter: 42,
        techTree: { "量子纠缠通讯": "UNLOCKED", "真空衰变引擎": "LOCKED" },
        characters: [{ id: "protagonist", name: "林默", coreMotivation: "逃离天鹅座引力阱", techLevel: "一级文明巅峰" }],
        plotGraveyard: [
          { id: "clue_001", title: "主角在火星废墟捡到的奇怪二极管", introducedInChapter: 15, status: "PENDING", resolveTargetVolume: 1 },
          { id: "clue_002", title: "第三安全局局长桌上的绝密红头文件", introducedInChapter: 30, status: "PENDING", resolveTargetVolume: 1 }
        ]
      };
    });

    // Step 2: PlotPlanner 强行从伏笔池抽卡，重构细纲契约
    const chapterPlan: ChapterPlan = await step.run("plot-planning-handoff", async () => {
      // 1. 过滤出当前卷可回收且状态为 PENDING 的伏笔
      const availableClues = workspace.plotGraveyard.filter(
        (c) => c.status === "PENDING" && c.resolveTargetVolume === workspace.currentVolume
      );

      // 2. 强行随机抽取 1 个旧伏笔填坑，保证长文本不出现逻辑遗忘
      const cluesToResolve: PlotClue[] = [];
      if (availableClues.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableClues.length);
        cluesToResolve.push(availableClues[randomIndex]);
      }

      // 3. 呼叫大纲 Agent 构建本章细纲
      const prompt = `
        基于当前科技树 [${Object.keys(workspace.techTree).join(",")}]，
        规划第 ${workspace.currentChapter} 章大纲。
        必须在本章中填补以下伏笔带来的坑：${cluesToResolve.map((c) => c.title).join("; ")}
      `;
      
      const llmResponse = await mockLLMCall("PlotPlanner-Agent", prompt);
      
      return {
        chapterNumber: workspace.currentChapter,
        title: "第42章：量子隧穿效应下的‘幽灵’",
        coreConflict: "林默在实验室里利用量子纠缠设备检测二极管，引来安全局截杀",
        cluesToIntroduce: ["林默发现二极管内部包含一段非人类的DNA编码"],
        cluesToResolve
      };
    });

    // Step 3: Drafter 核心文本输出循环（结合第一篇 Prompt 约束）
    const finalizedContent = await step.run("drafter-writing-loop", async () => {
      let currentDraft = "";
      let isApproved = false;
      let reviewFeedback = "";
      let attempts = 0;

      while (!isApproved && attempts < 3) {
        attempts++;
        // 呼叫 Drafter 编写正文
        currentDraft = await mockLLMCall(
          "Drafter-Agent", 
          `依据细纲：${JSON.stringify(chapterPlan)}。反馈意见：${reviewFeedback}。严格遵守消除AI味和排版规范。`
        );

        // Handoff 给 Reviewer Agent 进行网文味和毒点审计
        const reviewResult = await mockLLMCall(
          "Reviewer-Agent", 
          `审计以下正文是否具备AI味、说明文过多或网文毒点。正文：${currentDraft}`
        );
        
        // 假设 Reviewer 输出格式包含 approved 和 feedback
        const parsedReview = JSON.parse(reviewResult); 
        isApproved = parsedReview.approved;
        reviewFeedback = parsedReview.feedback;
      }

      return currentDraft;
    });

    // Step 4: 状态持久化落盘（回写本地 Markdown 文件）
    await step.run("flush-to-markdown", async () => {
      // 1. 回写正文：Manuscripts/ch_042.md
      // 2. 更新伏笔池：将 chapterPlan.cluesToResolve 标记为 RESOLVED
      // 3. 将 chapterPlan.cluesToIntroduce 插入到 plot_graveyard.md 
      console.log(`第 ${chapterPlan.chapterNumber} 章顺利落盘，成功填坑：`, chapterPlan.cluesToResolve);
    });

    return { success: true, chapter: chapterPlan.chapterNumber };
  }
);

------------------------------
## 💡 下一步：你要开始写代码了吗？
这两份指南构成了你项目的核心动力机组。如果你准备开始本地环境初始化，我可以为你输出：

   1. 本地 Markdown 与这套 TS 状态双向解析（AST Parser）的代码实现；
   2. Reviewer Agent 专门检测“毒点和说明文超标”的 JSON 结构化校验 Prompt。


