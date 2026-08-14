import { describe, expect, test } from 'bun:test';

import type { DimensionScores } from '../domain/schema';

import {
  assembleReviewerResult,
  computeReviewFreshnessAfterManualEdit,
  detectRuleHardFailures,
  DEFAULT_REVIEWER_RULE_THRESHOLDS,
  parseReviewerRules,
  TOTAL_SCORE_PASS_THRESHOLD,
} from './reviewer';

const PASSING_SCORES: DimensionScores = {
  antiAiVoice: 90,
  webFictionPacing: 88,
  emotionCurve: 85,
  characterConsistency: 90,
  settingConsistency: 90,
  clueCausality: 90,
  readabilityLayout: 90,
  languageTexture: 90,
};

const FAILING_SCORES: DimensionScores = {
  ...PASSING_SCORES,
  emotionCurve: 60,
};

describe('reviewer rule loading', () => {
  test('parseReviewerRules falls back to defaults on empty input', () => {
    expect(parseReviewerRules('')).toEqual(DEFAULT_REVIEWER_RULE_THRESHOLDS);
  });

  test('parseReviewerRules reads configured thresholds', () => {
    const rules = parseReviewerRules('{"paragraphMinChars": 40, "paragraphMaxChars": 200, "bannedTerms": ["总而言之"]}');
    expect(rules.paragraphMinChars).toBe(40);
    expect(rules.bannedTerms).toEqual(['总而言之']);
  });
});

describe('rule-bundle hard failure detection', () => {
  test('flags banned terms', () => {
    const failures = detectRuleHardFailures('总而言之，一切都结束了。', {
      ...DEFAULT_REVIEWER_RULE_THRESHOLDS,
      bannedTerms: ['总而言之'],
    });
    expect(failures.map((f) => f.code)).toContain('banned-terms-hit');
  });

  test('flags paragraph length violations', () => {
    const failures = detectRuleHardFailures('短。', DEFAULT_REVIEWER_RULE_THRESHOLDS);
    expect(failures.map((f) => f.code)).toContain('paragraph-length-violation');
  });

  test('passes clean text within paragraph bounds', () => {
    const okParagraph = '林默走进舱室，仔细检查了每一处接口的电压读数，反复确认没有任何异常波动之后，才终于放心地松了一口气，转身准备离开这间狭窄的控制室。';
    const failures = detectRuleHardFailures(okParagraph, DEFAULT_REVIEWER_RULE_THRESHOLDS);
    expect(failures).toEqual([]);
  });
});

describe('assembleReviewerResult', () => {
  const okParagraph = '林默走进舱室，仔细检查了每一处接口的电压读数，反复确认没有任何异常波动之后，才终于放心地松了一口气，转身准备离开这间狭窄的控制室。';

  test('approves when no hard failures and scores clear both thresholds', () => {
    const result = assembleReviewerResult(okParagraph, {
      hardFailures: [],
      dimensionScores: PASSING_SCORES,
      rewriteDirectives: [],
    });
    expect(result.approved).toBe(true);
    expect(result.totalScore).toBeGreaterThanOrEqual(TOTAL_SCORE_PASS_THRESHOLD);
    expect(result.overrideEligible).toBe(true);
  });

  test('rejects when a dimension score is below the per-dimension threshold', () => {
    const result = assembleReviewerResult(okParagraph, {
      hardFailures: [],
      dimensionScores: FAILING_SCORES,
      rewriteDirectives: ['补上中段情绪压迫段落'],
    });
    expect(result.approved).toBe(false);
  });

  test('non-overridable hard failure sets overrideEligible to false', () => {
    const result = assembleReviewerResult(okParagraph, {
      hardFailures: [{ code: 'tech-tree-violation', message: '触发了阶段外科技效果' }],
      dimensionScores: PASSING_SCORES,
      rewriteDirectives: [],
    });
    expect(result.approved).toBe(false);
    expect(result.overrideEligible).toBe(false);
  });

  test('overridable hard failure keeps overrideEligible true', () => {
    const result = assembleReviewerResult(okParagraph, {
      hardFailures: [{ code: 'missing-ending-hook', message: '结尾缺少钩子' }],
      dimensionScores: PASSING_SCORES,
      rewriteDirectives: [],
    });
    expect(result.approved).toBe(false);
    expect(result.overrideEligible).toBe(true);
  });
});

describe('review freshness after manual edits', () => {
  test('manual edit to a previously approved artifact goes stale', () => {
    expect(computeReviewFreshnessAfterManualEdit(true)).toEqual({
      status: 'stale',
      reason: 'hand-edited-after-approval',
    });
  });

  test('manual edit to a not-yet-approved artifact stays fresh', () => {
    expect(computeReviewFreshnessAfterManualEdit(false)).toEqual({ status: 'fresh' });
  });
});
