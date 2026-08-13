import type { StableId } from '../domain/schema';

/**
 * Minimal, pure "write-related run" drift-abort rules
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.4.2:
 * "活动中的写相关 run 若遭遇新的 canonical 快照，应被自动中止并记录 drift
 * 原因，而不是在中途 rebase." and
 * docs/architecture/modules/10-v1-execution-plan.md §10.7 acceptance:
 * "活动中的主流程遇到新快照时，会中止并留下明确 drift 原因").
 *
 * A run is not automatically restarted after an abort; a fresh `propose` /
 * `regenerate` command must be issued against the new canonical version.
 */

export const RUN_STATUS_VALUES = ['running', 'completed', 'aborted', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUS_VALUES)[number];

export interface RunSnapshotRef {
  readonly runId: StableId;
  readonly status: RunStatus;
  /** Canonical book snapshot version the run started from / is writing against. */
  readonly basedOnCanonicalVersion: StableId;
  /** `true` for runs that end in a canonical write (propose/regenerate/approve/override-approve pipelines). */
  readonly isWriteRelated: boolean;
}

export interface RunAbortDecision {
  readonly shouldAbort: boolean;
  readonly run: RunSnapshotRef;
  readonly driftReason?: string;
}

/**
 * Checks a single active run against the latest known canonical snapshot
 * version and aborts it (recording a drift reason) if a newer snapshot has
 * appeared since the run started. Read-only / non-write runs are left
 * untouched since they cannot corrupt canonical state.
 */
export function evaluateRunAgainstSnapshotDrift(
  run: RunSnapshotRef,
  latestCanonicalVersion: StableId,
): RunAbortDecision {
  if (
    run.status !== 'running' ||
    !run.isWriteRelated ||
    run.basedOnCanonicalVersion === latestCanonicalVersion
  ) {
    return { shouldAbort: false, run };
  }

  const driftReason =
    `Run "${run.runId}" started against canonical version "${run.basedOnCanonicalVersion}" ` +
    `but the workspace has since advanced to "${latestCanonicalVersion}"; aborting instead of ` +
    'rebasing mid-flight.';

  return {
    shouldAbort: true,
    run: { ...run, status: 'aborted' },
    driftReason,
  };
}

/** Batch helper used by the re-sync-state flow after a new canonical snapshot lands. */
export function abortDriftedRuns(
  activeRuns: readonly RunSnapshotRef[],
  latestCanonicalVersion: StableId,
): readonly RunAbortDecision[] {
  return activeRuns
    .map((run) => evaluateRunAgainstSnapshotDrift(run, latestCanonicalVersion))
    .filter((decision) => decision.shouldAbort);
}
