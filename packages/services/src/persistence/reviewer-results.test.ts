import { afterEach, describe, expect, test } from 'bun:test';

import type { ReviewerResult } from '../domain';

import { prisma } from './client';
import { findPersistedReviewerResult, persistReviewerResult } from './reviewer-results';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];
const createdProposalIds: string[] = [];
const createdResultIds: string[] = [];

const reviewResultId = `result-reviewer-test-${Date.now().toString(36)}`;
const proposalId = `proposal-reviewer-test-${Date.now().toString(36)}`;
const runId = `run-reviewer-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-reviewer-test-${Date.now().toString(36)}`;
const bookId = 'book-reviewer-test';

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
  await prisma.proposal.deleteMany({ where: { proposalId: { in: createdProposalIds } } });
  await prisma.run.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('reviewer result persistence', () => {
  test('round-trips a reviewer result', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await prisma.run.create({
      data: {
        runId,
        workspaceId,
        bookId,
        commandIntent: 'propose',
        status: 'completed',
        requestedBy: 'author-test',
        idempotencyKey: `idem-run-${Date.now().toString(36)}`,
      },
    });
    createdProposalIds.push(proposalId);
    await prisma.proposal.create({
      data: {
        proposalId,
        workspaceId,
        bookId,
        artifactType: 'chapter-outline',
        targetId: 'chapter-reviewer-test',
        status: 'pending-approval',
        intent: 'propose',
        origin: 'generated',
        basedOnCanonicalVersion: 'snap-1',
        parentRunId: runId,
      },
    });
    createdResultIds.push(reviewResultId);
    await persistReviewerResult(reviewResultId, proposalId, result);

    const restored = await findPersistedReviewerResult(reviewResultId);

    expect(restored?.approved).toBe(true);
    expect(restored?.totalScore).toBe(89);
  });
});
