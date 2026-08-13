/**
 * Reviewer rule loading and structured review assembly, per
 * docs/architecture/modules/05-reviewer-and-quality-gates.md and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 7.
 *
 * V1 scope: rule-bundle detections (deterministic, testable) combined with an injected
 * "model evidence" pass for the semantic-only hard failures/dimensions. Reviewer output
 * always conforms to `ReviewerResultSchema` from src/domain, since the domain contract
 * is the single source of truth for the reviewer's structured shape.
 */
import {
  DimensionScoresSchema,
  ReviewerResultSchema,
  type DimensionScores,
  type ReviewHardFailure,
  type ReviewerResult,
} from '../domain/schema';
import type { ReviewHardFailureCode } from '../domain/values';

export const TOTAL_SCORE_PASS_THRESHOLD = 85;
export const DIMENSION_SCORE_PASS_THRESHOLD = 75;

/**
 * Hard failures that can never be overridden, per §5.6. Anything not in this set may be
 * eligible for a manual `OverrideAudit` when the author accepts the risk.
 */
export const NON_OVERRIDABLE_HARD_FAILURE_CODES: ReadonlySet<ReviewHardFailureCode> = new Set([
  'outline-structure-drift',
  'tech-tree-violation',
  'clue-payoff-conflict',
]);

export interface ReviewerRuleThresholds {
  readonly paragraphMinChars: number;
  readonly paragraphMaxChars: number;
  readonly bannedTerms: readonly string[];
}

export const DEFAULT_REVIEWER_RULE_THRESHOLDS: ReviewerRuleThresholds = {
  paragraphMinChars: 50,
  paragraphMaxChars: 150,
  bannedTerms: [],
};

interface RawReviewerRulesFile {
  readonly paragraphMinChars?: unknown;
  readonly paragraphMaxChars?: unknown;
  readonly bannedTerms?: unknown;
}

export class ReviewerRuleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewerRuleParseError';
  }
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Parses machine-enforced defaults (blacklist, thresholds) from `state/reviewer/`. Style
 * guidance stays in `prompts/` per §5.5 and is intentionally not modeled here.
 */
export function parseReviewerRules(raw: string): ReviewerRuleThresholds {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return DEFAULT_REVIEWER_RULE_THRESHOLDS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ReviewerRuleParseError(`Failed to parse reviewer rules JSON: ${message}`);
  }

  const raw2 = parsed as RawReviewerRulesFile;
  return {
    paragraphMinChars: readNumber(raw2.paragraphMinChars, DEFAULT_REVIEWER_RULE_THRESHOLDS.paragraphMinChars),
    paragraphMaxChars: readNumber(raw2.paragraphMaxChars, DEFAULT_REVIEWER_RULE_THRESHOLDS.paragraphMaxChars),
    bannedTerms: readStringArray(raw2.bannedTerms),
  };
}

function detectBannedTerms(text: string, bannedTerms: readonly string[]): boolean {
  return bannedTerms.some((term) => term.length > 0 && text.includes(term));
}

function detectParagraphLengthViolation(text: string, rules: ReviewerRuleThresholds): boolean {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  return paragraphs.some(
    (paragraph) => paragraph.length < rules.paragraphMinChars || paragraph.length > rules.paragraphMaxChars,
  );
}

/**
 * Deterministic rule-bundle detections. These are the "规则束" half of §5.1's
 * "规则束 + 模型证据" combination; semantic-only hard failures (motivation drift, tone,
 * pacing collapse, etc.) are supplied by `ModelEvidence` since they require judgment a
 * fixed rule set cannot reliably express.
 */
export function detectRuleHardFailures(
  text: string,
  rules: ReviewerRuleThresholds = DEFAULT_REVIEWER_RULE_THRESHOLDS,
): readonly ReviewHardFailure[] {
  const failures: ReviewHardFailure[] = [];

  if (detectBannedTerms(text, rules.bannedTerms)) {
    failures.push({ code: 'banned-terms-hit', message: 'Text matches a project-level banned term.' });
  }
  if (detectParagraphLengthViolation(text, rules)) {
    failures.push({
      code: 'paragraph-length-violation',
      message: `A paragraph falls outside the ${rules.paragraphMinChars}-${rules.paragraphMaxChars} char target range.`,
    });
  }

  return failures;
}

export interface ModelEvidence {
  readonly hardFailures: readonly ReviewHardFailure[];
  readonly dimensionScores: DimensionScores;
  readonly rewriteDirectives: readonly string[];
}

function isOverrideEligible(hardFailures: readonly ReviewHardFailure[]): boolean {
  return !hardFailures.some((failure) => NON_OVERRIDABLE_HARD_FAILURE_CODES.has(failure.code));
}

function computeApproved(hardFailures: readonly ReviewHardFailure[], dimensionScores: DimensionScores, totalScore: number): boolean {
  if (hardFailures.length > 0) {
    return false;
  }
  if (totalScore < TOTAL_SCORE_PASS_THRESHOLD) {
    return false;
  }
  return Object.values(dimensionScores).every((score) => score >= DIMENSION_SCORE_PASS_THRESHOLD);
}

function sumWeightedScore(dimensionScores: DimensionScores): number {
  const weights: Record<keyof DimensionScores, number> = {
    antiAiVoice: 20,
    webFictionPacing: 18,
    emotionCurve: 18,
    characterConsistency: 12,
    settingConsistency: 12,
    clueCausality: 10,
    readabilityLayout: 5,
    languageTexture: 5,
  };
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedSum = (Object.keys(weights) as (keyof DimensionScores)[]).reduce(
    (sum, key) => sum + dimensionScores[key] * weights[key],
    0,
  );
  return Math.round(weightedSum / totalWeight);
}

/**
 * Combines rule-bundle detections with injected model evidence into the canonical
 * `ReviewerResult` shape (§5.7). Result is validated against `ReviewerResultSchema` so
 * any drift from the domain contract fails loudly instead of silently persisting a
 * malformed structured result.
 */
export function assembleReviewerResult(
  text: string,
  modelEvidence: ModelEvidence,
  rules: ReviewerRuleThresholds = DEFAULT_REVIEWER_RULE_THRESHOLDS,
): ReviewerResult {
  const ruleFailures = detectRuleHardFailures(text, rules);
  const hardFailures = [...ruleFailures, ...modelEvidence.hardFailures];
  const dimensionScores = DimensionScoresSchema.parse(modelEvidence.dimensionScores);
  const totalScore = sumWeightedScore(dimensionScores);

  return ReviewerResultSchema.parse({
    approved: computeApproved(hardFailures, dimensionScores, totalScore),
    hardFailures,
    dimensionScores,
    totalScore,
    rewriteDirectives: modelEvidence.rewriteDirectives,
    overrideEligible: isOverrideEligible(hardFailures),
  });
}

export const REVIEW_STALE_REASON = 'hand-edited-after-approval';

/**
 * Determines whether a hand-edited, previously approved artifact's existing review has
 * gone stale, per §5.8: manual edits after approval immediately invalidate the review as
 * a derived risk flag (not a canonical status change).
 */
export function computeReviewFreshnessAfterManualEdit(
  wasApprovedBeforeEdit: boolean,
): { readonly status: 'fresh' | 'stale'; readonly reason?: string } {
  if (!wasApprovedBeforeEdit) {
    return { status: 'fresh' };
  }
  return { status: 'stale', reason: REVIEW_STALE_REASON };
}
