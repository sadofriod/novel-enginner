/**
 * Deterministic description-density detection for the Reviewer rule bundle
 * (`description-density` hard failure). Two signals for prose:
 *   - signal 1: a run of consecutive "pure description" paragraphs
 *   - signal 2: the share of pure-description paragraphs across the whole text
 * plus a separate rule for outlines: structural fields (`purpose` / `summary`)
 * must summarize, not narrate, so long narrative prose there also fails.
 *
 * "Pure description" means a paragraph that only describes observable action /
 * scene detail: it contains no dialogue and no inner-thought or information
 * advancement. Those markers are deliberately conservative so the rule only
 * catches mechanically obvious padding, leaving semantic judgment to the model
 * evidence pass.
 */
import type { ReviewHardFailure } from '../domain/schema';

export interface DescriptionDensityConfig {
  readonly maxConsecutiveDescriptionParagraphs: number;
  readonly maxDescriptionParagraphRatio: number;
  readonly minParagraphsToEvaluate: number;
  readonly outlineFieldMaxChars: number;
}

export const DEFAULT_DESCRIPTION_DENSITY_CONFIG: DescriptionDensityConfig = {
  maxConsecutiveDescriptionParagraphs: 12,
  maxDescriptionParagraphRatio: 0.75,
  minParagraphsToEvaluate: 4,
  outlineFieldMaxChars: 80,
};

/** Dialogue markers: CJK quotes plus ASCII straight quotes. */
const DIALOGUE_PATTERN = /[“”"「」『』]/;

/** Inner-thought / information-advancement markers that break a pure-description run. */
const ADVANCEMENT_MARKERS = [
  '意识到',
  '直觉',
  '这意味着',
  '意味着',
  '他明白',
  '她明白',
  '明白',
  '他知道',
  '她知道',
  '知道',
  '听懂了',
  '注意到',
  '感觉到',
  '感觉',
  '记得',
  '想到',
  '判断',
  '认为',
  '怀疑',
  '决定',
  '心想',
  '想起',
  '发现',
  '推测',
  '猜测',
];

/** True when the paragraph contains dialogue. */
function hasDialogue(paragraph: string): boolean {
  return DIALOGUE_PATTERN.test(paragraph);
}

/** True when the paragraph advances via inner thought or explicit information. */
function hasAdvancement(paragraph: string): boolean {
  return ADVANCEMENT_MARKERS.some((marker) => paragraph.includes(marker));
}

/** A "pure description" paragraph observes only; it neither speaks nor advances. */
export function isPureDescriptionParagraph(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return trimmed.length > 0 && !hasDialogue(trimmed) && !hasAdvancement(trimmed);
}

/** Splits text into non-empty paragraphs. */
function splitParagraphs(text: string): readonly string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Longest run of consecutive pure-description paragraphs (signal 1). */
function maxConsecutiveDescriptionRun(paragraphs: readonly string[]): number {
  return paragraphs.reduce(
    ({ current, max }, paragraph) => {
      const next = isPureDescriptionParagraph(paragraph) ? current + 1 : 0;
      return { current: next, max: Math.max(max, next) };
    },
    { current: 0, max: 0 },
  ).max;
}

/** Share of pure-description paragraphs across the whole text (signal 2). */
function descriptionParagraphRatio(paragraphs: readonly string[]): number {
  if (paragraphs.length === 0) {
    return 0;
  }
  const pureCount = paragraphs.filter(isPureDescriptionParagraph).length;
  return pureCount / paragraphs.length;
}

/**
 * Detects prose description-density by the two mechanical signals. Short texts
 * (fewer than `minParagraphsToEvaluate`) are never flagged so a single
 * scene-setting paragraph cannot trip the gate.
 */
export function detectDescriptionDensity(
  text: string,
  config: DescriptionDensityConfig = DEFAULT_DESCRIPTION_DENSITY_CONFIG,
): boolean {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length < config.minParagraphsToEvaluate) {
    return false;
  }
  const run = maxConsecutiveDescriptionRun(paragraphs);
  if (run >= config.maxConsecutiveDescriptionParagraphs) {
    return true;
  }
  return descriptionParagraphRatio(paragraphs) >= config.maxDescriptionParagraphRatio;
}

/**
 * Detects outline structural fields (`purpose` / `summary`) written as long
 * narrative prose instead of a concise summary. A field value whose length
 * exceeds `outlineFieldMaxChars` is treated as narration rather than a summary.
 */
export function detectOutlineNarrativeFields(
  text: string,
  config: DescriptionDensityConfig = DEFAULT_DESCRIPTION_DENSITY_CONFIG,
): boolean {
  return text.split('\n').some((line) => {
    const match = /^\s*(?:purpose|summary):\s+(.+)$/.exec(line);
    if (match === null || match[1] === undefined) {
      return false;
    }
    return [...match[1].trim()].length > config.outlineFieldMaxChars;
  });
}

/** Convenience: wraps both density detectors into a single failure check. */
export function detectDescriptionDensityHardFailures(
  text: string,
  config: DescriptionDensityConfig = DEFAULT_DESCRIPTION_DENSITY_CONFIG,
): readonly ReviewHardFailure[] {
  const failures: ReviewHardFailure[] = [];
  if (detectDescriptionDensity(text, config)) {
    failures.push({ code: 'description-density', message: '动作/场景描写过于密集，缺少对白、内心或信息推进。' });
  }
  if (detectOutlineNarrativeFields(text, config)) {
    failures.push({ code: 'description-density', message: '大纲结构字段写成叙事长句，应改为简洁概括。' });
  }
  return failures;
}
