/**
 * Builds the proposal-vs-canonical field diffs that the Web console renders in the
 * approval detail (docs/architecture/modules/06-web-console-and-approval.md §6.8).
 * V1 exposes a single `content` field diff so the author can compare the original
 * canonical body with the proposed (optimized) body before approving.
 */
import type { ArtifactFieldDiff } from './artifact-detail';

/** Builds a content-level field diff between the canonical and proposed bodies. */
export function buildContentFieldDiff(canonicalContent: string, proposedContent: string): readonly ArtifactFieldDiff[] {
  return [
    {
      field: 'content',
      canonical: canonicalContent,
      proposed: proposedContent,
      changed: canonicalContent !== proposedContent,
    },
  ];
}
