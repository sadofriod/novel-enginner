import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

/**
 * Pure ordering for the Web console approval queue, per
 * docs/architecture/modules/06-web-console-and-approval.md §6.7:
 * 1. how much the artifact blocks main-line progress,
 * 2. artifact type weight,
 * 3. most recently updated first.
 */

const BLOCKING_PROPOSAL_STATUSES: ReadonlySet<string> = new Set([
  'pending-approval',
  'commit-blocked',
  'waiting-sync',
]);

const ARTIFACT_TYPE_WEIGHT: Record<string, number> = {
  'project-brief': 120,
  'world-foundation': 115,
  'story-blueprint': 110,
  'chapter-outline': 100,
  'world-change': 90,
  'chapter-manuscript': 80,
  'volume-outline': 60,
  'character-update': 40,
  'faction-update': 40,
  'location-update': 40,
  'tech-rule-update': 40,
  'fact-update': 30,
  'relationship-update': 30,
  'resource-update': 30,
};

function isBlocking(summary: ArtifactSummary): boolean {
  return summary.proposalStatus !== undefined && BLOCKING_PROPOSAL_STATUSES.has(summary.proposalStatus);
}

function typeWeight(summary: ArtifactSummary): number {
  return ARTIFACT_TYPE_WEIGHT[summary.artifactType] ?? 0;
}

function recencyKey(summary: ArtifactSummary): string {
  return summary.updatedAt ?? '';
}

/** Sorts artifact summaries into the default approval-queue order (highest priority first). */
export function sortApprovalQueue(summaries: readonly ArtifactSummary[]): readonly ArtifactSummary[] {
  return [...summaries].sort((a, b) => {
    const blockingDelta = Number(isBlocking(b)) - Number(isBlocking(a));
    if (blockingDelta !== 0) {
      return blockingDelta;
    }
    const weightDelta = typeWeight(b) - typeWeight(a);
    if (weightDelta !== 0) {
      return weightDelta;
    }
    return recencyKey(b).localeCompare(recencyKey(a));
  });
}
