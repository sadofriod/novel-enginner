export interface DialogueRound {
  readonly round: number;
  readonly objective: string;
  readonly prompt: string;
}

const REQUIRED_DECISIONS = [
  'genre',
  'targetAudience',
  'readerPromise',
  'corePremise',
  'openingHook',
  'contentBoundaries',
  'format',
] as const;

export function initializeDialogueRounds(): readonly DialogueRound[] {
  return [
    { round: 1, objective: '题材、读者与阅读承诺', prompt: '明确作品题材、目标读者与给读者的承诺。' },
    { round: 2, objective: '核心创意、主角与开篇钩子', prompt: '描述核心创意、主角与开篇钩子。' },
    { round: 3, objective: '核心冲突、对立力量与情感体验', prompt: '定义核心冲突、对立力量与情感体验。' },
    { round: 4, objective: '差异化、趋势取舍与内容边界', prompt: '说明差异化策略、趋势取舍与内容边界。' },
    { round: 5, objective: '篇幅与终局偏好确认', prompt: '确认篇幅、连载形态、终局偏好与待验证假设。' },
  ];
}

export function validateKeyDecisions(decisions: Record<string, string | undefined>): boolean {
  return REQUIRED_DECISIONS.every((key) => {
    const value = decisions[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function extractCleanedSummary(rawText: string): string {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}...` : normalized;
}

export function generateTrendReport(sources: ReadonlyArray<{ readonly title: string; readonly summary: string }>): string {
  if (sources.length === 0) {
    return '暂无市场研究结果。';
  }

  return sources
    .map((source) => `- ${source.title}: ${extractCleanedSummary(source.summary)}`)
    .join('\n');
}

function splitList(value: string | undefined, fallback: string): readonly string[] {
  const raw = value ?? fallback;
  return raw.split(/[，,;；]/).map((entry) => entry.trim()).filter(Boolean);
}

function defaultString(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function buildProjectBriefDefaults(decisions: Record<string, string | undefined>) {
  return {
    title: defaultString(decisions.title, '新作立项简报'),
    genres: splitList(decisions.genre, '科幻'),
    targetAudience: defaultString(decisions.targetAudience, '青年通勤阅读人群'),
    readerPromise: defaultString(decisions.readerPromise, '提供持续的紧张感和情感共鸣'),
    corePremise: defaultString(decisions.corePremise, '在压迫性的世界规则中追求自我选择'),
    openingHook: defaultString(decisions.openingHook, '一场看似偶然的事件将主人公推向世界中心'),
    contentBoundaries: splitList(decisions.contentBoundaries, '不写出全篇大结局，不使用盗版元素'),
    format: defaultString(decisions.format, '连载长篇'),
  };
}

export function generateProjectBriefProposal(decisions: Record<string, string | undefined>): {
  readonly id: string;
  readonly title: string;
  readonly genres: readonly string[];
  readonly targetAudience: string;
  readonly readerPromise: string;
  readonly corePremise: string;
  readonly openingHook: string;
  readonly contentBoundaries: readonly string[];
  readonly format: string;
  readonly status: 'draft';
} {
  const defaults = buildProjectBriefDefaults(decisions);

  return {
    id: `project-brief-${Date.now()}`,
    title: defaults.title,
    genres: defaults.genres,
    targetAudience: defaults.targetAudience,
    readerPromise: defaults.readerPromise,
    corePremise: defaults.corePremise,
    openingHook: defaults.openingHook,
    contentBoundaries: defaults.contentBoundaries,
    format: defaults.format,
    status: 'draft',
  };
}
