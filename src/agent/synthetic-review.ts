/**
 * Synthetic review dispatch: when a canonical file is hand-edited after a proposal
 * was approved, this module computes the review-stale risk flag and optionally
 * dispatches an Inngest `novel/review.synthetic-requested` event to trigger an
 * async re-assessment, per
 * docs/architecture/modules/05-reviewer-and-quality-gates.md §5.8 and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 7.
 *
 * The review-stale flag itself is a derived, non-canonical risk marker — it must not
 * be written into the canonical proposal status machine. The downstream synthetic
 * review is what produces a new structured `ReviewerResult` that determines whether
 * blocking resumes.
 */

import { computeReviewFreshnessAfterManualEdit, REVIEW_STALE_REASON } from './reviewer';

export interface HandEditedArtifact {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly filePath: string;
  readonly wasApprovedBeforeEdit: boolean;
}

export interface ReviewFreshnessResult {
  readonly stale: boolean;
  readonly reason?: string;
}

/**
 * Determines whether a hand-edited artifact's review is stale (§5.8) and
 * optionally dispatches an Inngest synthetic-review event. Returns the freshness
 * result synchronously so callers can emit the `artifact.review-stale` SSE event
 * immediately without waiting for the async review to complete.
 *
 * @param artifact  Metadata about the hand-edited file and its prior approval state.
 * @param dispatch  Optional async callback to send the Inngest event. When absent the
 *                  function is pure/sync-safe (useful in tests).
 */
export async function handleHandEditedArtifact(
  artifact: HandEditedArtifact,
  dispatch?: (event: {
    name: string;
    data: {
      workspaceId: string;
      bookId: string;
      artifactType: string;
      targetId: string;
      editedFilePath: string;
    };
  }) => Promise<void>,
): Promise<ReviewFreshnessResult> {
  const freshness = computeReviewFreshnessAfterManualEdit(artifact.wasApprovedBeforeEdit);

  if (freshness.status === 'stale' && dispatch !== undefined) {
    await dispatch({
      name: 'novel/review.synthetic-requested',
      data: {
        workspaceId: artifact.workspaceId,
        bookId: artifact.bookId,
        artifactType: artifact.artifactType,
        targetId: artifact.targetId,
        editedFilePath: artifact.filePath,
      },
    });
  }

  return {
    stale: freshness.status === 'stale',
    ...(freshness.reason !== undefined ? { reason: freshness.reason } : {}),
  };
}

/**
 * Convenience guard: returns true when the artifact should surface a
 * `review-stale` warning in the Web console and SSE stream.
 */
export function isReviewStale(wasApprovedBeforeEdit: boolean): boolean {
  return computeReviewFreshnessAfterManualEdit(wasApprovedBeforeEdit).status === 'stale';
}

export { REVIEW_STALE_REASON };
