import { describe, expect, test } from 'bun:test';

import {
  OverrideAuditSchema,
  ReviewerResultSchema,
  WorkspaceValidityStateSchema,
} from './review';

const PASSING_SCORES = {
  antiAiVoice: 90,
  webFictionPacing: 88,
  emotionCurve: 85,
  characterConsistency: 90,
  settingConsistency: 90,
  clueCausality: 90,
  readabilityLayout: 90,
  languageTexture: 90,
};

describe('review schema contracts', () => {
  test('ReviewerResultSchema requires scores, directives, and eligibility', () => {
    expect(
      ReviewerResultSchema.parse({
        approved: true,
        hardFailures: [],
        dimensionScores: PASSING_SCORES,
        totalScore: 89,
        rewriteDirectives: [],
        overrideEligible: false,
      }),
    ).toMatchObject({ approved: true, totalScore: 89 });
  });

  test('OverrideAuditSchema embeds a score snapshot and failed checks', () => {
    expect(
      OverrideAuditSchema.parse({
        overrideReason: '紧急修正',
        overrideBy: 'user-1',
        relatedRunId: 'run-1',
        failedChecks: [{ code: 'weak-payoff-release', message: '高潮释放不足' }],
        scoreSnapshot: {
          approved: false,
          hardFailures: [{ code: 'weak-payoff-release', message: '高潮释放不足' }],
          dimensionScores: PASSING_SCORES,
          totalScore: 40,
          rewriteDirectives: [],
          overrideEligible: true,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ overrideBy: 'user-1' });
  });

  test('WorkspaceValidityStateSchema accepts a last-known-good snapshot', () => {
    expect(
      WorkspaceValidityStateSchema.parse({
        state: 'clean',
        lastKnownGoodSnapshot: 'snap-1',
      }),
    ).toMatchObject({ state: 'clean' });
  });
});
