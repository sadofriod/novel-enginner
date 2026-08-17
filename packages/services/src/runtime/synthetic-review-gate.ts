/**
 * Synthetic-review outcome application and downstream gate (§5.8). When a synthetic
 * re-review of hand-edited canonical content returns a non-exemptible failure, the
 * artifact stays canonical (never rolled back) but every downstream auto flow that
 * depends on it must block until a fresh review passes.
 */
import { isNonExemptibleReviewFailure } from '../agent/reviewer';
import type { ReviewerResult } from '../domain';
import type { RuntimeStore } from './store';

export type SyntheticReviewOutcome =
  | { readonly status: 'passed' }
  | { readonly status: 'blocked'; readonly reviewerResult: ReviewerResult };

/** Records the synthetic re-review outcome on the artifact; never touches canonical content. */
export function applySyntheticReviewOutcome(store: RuntimeStore, artifactType: string, targetId: string, outcome: SyntheticReviewOutcome): void {
  const artifact = store.getArtifact(artifactType, targetId);
  if (artifact === undefined) {
    return;
  }
  const reviewBlocked = outcome.status === 'blocked' ? isNonExemptibleReviewFailure(outcome.reviewerResult) : false;
  store.upsertArtifact({
    ...artifact,
    reviewStale: false,
    reviewBlocked,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Gate for downstream auto flows: returns true when the artifact's latest synthetic
 * review found a non-exemptible failure that must block dependent work.
 */
export function isDownstreamAutoFlowBlocked(store: RuntimeStore, artifactType: string, targetId: string): boolean {
  return store.getArtifact(artifactType, targetId)?.reviewBlocked === true;
}
