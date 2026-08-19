import { describe, expect, test } from 'bun:test';

import type { DimensionScores } from '../domain/schema';

import {
  assembleReviewerResult,
  computeReviewFreshnessAfterManualEdit,
  detectRuleHardFailures,
  DEFAULT_REVIEWER_RULE_THRESHOLDS,
  isNonExemptibleReviewFailure,
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

  test('parseReviewerRules reads description-density thresholds', () => {
    const rules = parseReviewerRules(
      '{"densityMaxConsecutiveParagraphs": 4, "densityMaxParagraphRatio": 0.5, "densityMinParagraphs": 3, "outlineFieldMaxChars": 60}',
    );
    expect(rules.densityMaxConsecutiveParagraphs).toBe(4);
    expect(rules.densityMaxParagraphRatio).toBe(0.5);
    expect(rules.densityMinParagraphs).toBe(3);
    expect(rules.outlineFieldMaxChars).toBe(60);
  });

  test('parseReviewerRules falls back to default density thresholds when absent', () => {
    const rules = parseReviewerRules('{"bannedTerms": ["仿佛"]}');
    expect(rules.densityMaxConsecutiveParagraphs).toBe(DEFAULT_REVIEWER_RULE_THRESHOLDS.densityMaxConsecutiveParagraphs);
    expect(rules.densityMaxParagraphRatio).toBe(DEFAULT_REVIEWER_RULE_THRESHOLDS.densityMaxParagraphRatio);
    expect(rules.densityMinParagraphs).toBe(DEFAULT_REVIEWER_RULE_THRESHOLDS.densityMinParagraphs);
    expect(rules.outlineFieldMaxChars).toBe(DEFAULT_REVIEWER_RULE_THRESHOLDS.outlineFieldMaxChars);
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

  test('flags prose with dense consecutive action/scene description', () => {
    const dense = [
      '旧货摊的塑料棚顶漏下一道灰光，落在一堆废弃的数据读取器上。',
      '工作台边缘积了一层薄灰，几根散落的导线搭在铁盒边缘。',
      '墙角的密封金属箱排成一列，箱体上贴着泛黄的标签。',
      '凯蹲在摊前，指尖划过废弃的生物电极组件，断裂处露出灰白的内芯。',
    ].join('\n\n');
    const failures = detectRuleHardFailures(dense, DEFAULT_REVIEWER_RULE_THRESHOLDS);
    expect(failures.map((f) => f.code)).toContain('description-density');
  });

  test('does not flag prose that alternates dialogue and inner thought', () => {
    const balanced = [
      '“这根校准线还能用？”凯拿起一根半米长的黑色线缆。',
      '老周眯起眼，他意识到这不是普通的旧货——这是清洗前夜才会流出的规格。',
      '“三百五。”老周压低声音，“最近风声不太对，好几个熟面孔都不见了。”',
      '凯的手指在接口处停住。他明白这层意思：不是普通的风声紧，而是系统在清洗。',
      '“三百。”凯从口袋掏出皱巴巴的CP卡，拍在摊位上。',
    ].join('\n\n');
    const failures = detectRuleHardFailures(balanced, DEFAULT_REVIEWER_RULE_THRESHOLDS);
    expect(failures.map((f) => f.code)).not.toContain('description-density');
  });

  test('flags outline structural fields written as narrative prose', () => {
    const outline = [
      'sceneSkeleton:',
      '  - id: scene-clock',
      '    purpose: 凯走进老周的旧货摊，蹲下身子，指尖缓缓划过一堆废弃的生物电极组件，细如发丝的金属导线在昏暗灯光下泛着暗淡银光，断裂处露出灰白的内芯，空气中混杂着金属锈蚀与旧电路板受潮的味道。',
      '    locationId: location-harbor',
    ].join('\n');
    const failures = detectRuleHardFailures(outline, DEFAULT_REVIEWER_RULE_THRESHOLDS);
    expect(failures.map((f) => f.code)).toContain('description-density');
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

describe('isNonExemptibleReviewFailure', () => {
  test('a rejected, non-overridable result is a non-exemptible failure', () => {
    const result = assembleReviewerResult(
      'A stable paragraph that passes every rule bundle while remaining long enough for the deterministic length rule to accept it.',
      { hardFailures: [{ code: 'clue-payoff-conflict', message: 'Clue never pays off.' }], dimensionScores: FAILING_SCORES, rewriteDirectives: [] },
    );
    expect(result.approved).toBe(false);
    expect(result.overrideEligible).toBe(false);
    expect(isNonExemptibleReviewFailure(result)).toBe(true);
  });

  test('a rejected but override-eligible result is exemptible', () => {
    const result = assembleReviewerResult(
      'A stable paragraph that passes every rule bundle while remaining long enough for the deterministic length rule to accept it.',
      { hardFailures: [{ code: 'exposition-overload', message: 'Exposition is overloaded.' }], dimensionScores: FAILING_SCORES, rewriteDirectives: [] },
    );
    expect(result.approved).toBe(false);
    expect(result.overrideEligible).toBe(true);
    expect(isNonExemptibleReviewFailure(result)).toBe(false);
  });

  test('an approved result is never a non-exemptible failure', () => {
    const result = assembleReviewerResult(
      'A stable paragraph that passes every rule bundle while remaining long enough for the deterministic length rule to accept it.',
      { hardFailures: [], dimensionScores: PASSING_SCORES, rewriteDirectives: [] },
    );
    expect(result.approved).toBe(true);
    expect(isNonExemptibleReviewFailure(result)).toBe(false);
  });
});
