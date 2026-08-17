import { afterEach, describe, expect, test } from 'bun:test';

import type { ReviewerResult } from '../domain';

import { prisma } from './client';
import { findPersistedReviewerResult, persistReviewerResult } from './reviewer-results';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdResultIds: string[] = [];

const reviewResultId = `result-reviewer-test-${Date.now().toString(36)}`;
const proposalId = `proposal-reviewer-test-${Date.now().toString(36)}`;

const result: ReviewerResult = {
  approved: true,
  hardFailures: [],
  dimensionScores: {
    antiAiVoice: 90,
    webFictionPacing: 88,
    emotionCurve: 85,
    characterConsistency: 90,
    settingConsistency: 90,
    clueCausality: 90,
    readabilityLayout: 90,
    languageTexture: 90,
  },
  totalScore: 89,
  rewriteDirectives: [],
  overrideEligible: false,
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.reviewerResult.deleteMany({ where: { reviewResultId: { in: createdResultIds } } });
});

describe('reviewer result persistence', () => {
  test('round-trips a reviewer result', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdResultIds.push(reviewResultId);
    await persistReviewerResult(reviewResultId, proposalId, result);

    const restored = await findPersistedReviewerResult(reviewResultId);

    expect(restored?.approved).toBe(true);
    expect(restored?.totalScore).toBe(89);
  });
});
