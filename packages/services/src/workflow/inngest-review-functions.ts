import { NonRetriableError } from 'inngest';

import { assembleReviewerResult, isNonExemptibleReviewFailure } from '../agent/reviewer';
import { requestReviewerModelEvidence } from '../agent/reviewer-agent';
import { loadReviewerRules } from '../agent/reviewer-rules-loader';
import { createDefaultModelProvider } from '../agent/provider';
import { persistReviewerResultAndLinkProposal } from '../persistence/operations';
import type { ReviewerResult } from '../domain/schema';
import { inngest } from './inngest-client';

interface SyntheticReviewRunResult {
  readonly artifactType: string;
  readonly targetId: string;
  readonly editedFilePath: string;
  readonly status: 'blocked' | 'passed';
  readonly reviewerResult: ReviewerResult;
}

function reportSyntheticReviewOutcome(input: {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly status: 'passed' | 'blocked';
  readonly reviewerResult: unknown;
}): Promise<Response> {
  return fetch(`${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/review/synthetic-outcome`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export const syntheticReviewFunction = inngest.createFunction(
  {
    id: 'synthetic-review',
    name: 'Synthetic Review After Hand Edit',
    retries: 1,
  },
  { event: 'novel/review.synthetic-requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, artifactType, targetId, editedFilePath, editedText, proposalId } = event.data;

    const reviewResult = await step.run('run-synthetic-review', async (): Promise<SyntheticReviewRunResult> => {
      if (editedText === undefined) {
        throw new NonRetriableError(
          `Synthetic review for ${artifactType}/${targetId} requires editedText (${editedFilePath}).`,
        );
      }

      const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
      const result = assembleReviewerResult(
        editedText,
        await requestReviewerModelEvidence(createDefaultModelProvider(), artifactType, editedText, undefined, workspaceRoot),
        await loadReviewerRules(workspaceRoot),
      );

      if (proposalId !== undefined) {
        await persistReviewerResultAndLinkProposal(
          `synthetic-review-${targetId}-${Date.now().toString(36)}`,
          proposalId,
          result,
        );
      }

      return {
        artifactType,
        targetId,
        editedFilePath,
        status: isNonExemptibleReviewFailure(result) ? 'blocked' : 'passed',
        reviewerResult: result,
      };
    });

    await step.run('apply-outcome', async () => {
      const response = await reportSyntheticReviewOutcome({ workspaceId, bookId, artifactType, targetId, status: reviewResult.status, reviewerResult: reviewResult.reviewerResult });
      if (!response.ok) {
        throw new NonRetriableError(`apply synthetic review outcome failed: ${response.status}`);
      }
    });

    return { workspaceId, bookId, ...reviewResult };
  },
);

export const rebuildGraphFunction = inngest.createFunction(
  { id: 'rebuild-graph', name: 'Rebuild Derived Graph' },
  { event: 'novel/sync.rebuild-graph' },
  async ({ event, step }) => {
    const { workspaceId, bookId } = event.data;
    await step.run('rebuild', async () => {
      const response = await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/rebuild-graph`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
      if (!response.ok) {
        throw new NonRetriableError(`rebuild-graph failed: ${response.status}`);
      }
    });
    return { workspaceId, bookId, status: 'graph-rebuilt' };
  },
);
