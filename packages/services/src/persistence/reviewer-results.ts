import type { ReviewerResult } from '../domain';
import { ReviewerResultSchema } from '../domain/schema';

import { prisma } from './client';
import { toReviewerResultCreateInput } from './mappers';

export async function persistReviewerResult(
  reviewResultId: string,
  proposalId: string,
  result: ReviewerResult,
): Promise<void> {
  const data = toReviewerResultCreateInput(reviewResultId, proposalId, result);
  await prisma.reviewerResult.upsert({
    where: { reviewResultId },
    create: data,
    update: {
      approved: data.approved,
      hardFailures: data.hardFailures,
      dimensionScores: data.dimensionScores,
      totalScore: data.totalScore,
      rewriteDirectives: data.rewriteDirectives,
      overrideEligible: data.overrideEligible,
    },
  });
}

export async function persistReviewerResultAndLinkProposal(
  reviewResultId: string,
  proposalId: string,
  result: ReviewerResult,
): Promise<void> {
  const data = toReviewerResultCreateInput(reviewResultId, proposalId, result);
  await prisma.$transaction([
    prisma.reviewerResult.upsert({
      where: { reviewResultId },
      create: data,
      update: {
        approved: data.approved,
        hardFailures: data.hardFailures,
        dimensionScores: data.dimensionScores,
        totalScore: data.totalScore,
        rewriteDirectives: data.rewriteDirectives,
        overrideEligible: data.overrideEligible,
      },
    }),
    prisma.proposal.update({
      where: { proposalId },
      data: { latestReviewResultId: reviewResultId },
    }),
  ]);
}

export async function findPersistedReviewerResult(reviewResultId: string): Promise<ReviewerResult | undefined> {
  const row = await prisma.reviewerResult.findUnique({ where: { reviewResultId } });
  if (row === null) {
    return undefined;
  }
  return ReviewerResultSchema.parse({
    approved: row.approved,
    hardFailures: row.hardFailures,
    dimensionScores: row.dimensionScores,
    totalScore: row.totalScore,
    rewriteDirectives: row.rewriteDirectives,
    overrideEligible: row.overrideEligible,
  });
}
