/* eslint-disable complexity */

import { handleHandEditedArtifact } from '../agent/synthetic-review';
import { buildDerivedGraph } from '../graph/derive/build';
import type { RunSnapshotRef } from '../workflow/run-drift';
import { abortDriftedRuns } from '../workflow/run-drift';
import { resolveLayoutRuleForPath } from '../workspace/layout';
import type { SyntheticCommit, WorkspaceSessionState, WorkspaceSyncSession } from '../workspace/session';
import type { WorkspaceFileInput } from '../workspace/sync-engine';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';

const PROPOSAL_ARTIFACT_TYPE_BY_CANONICAL_KIND: Readonly<Record<string, string>> = {
  character: 'character-update',
  faction: 'faction-update',
  location: 'location-update',
  'tech-rule': 'tech-rule-update',
  fact: 'fact-update',
  relationship: 'relationship-update',
  resource: 'resource-update',
};

type SyntheticReviewInput = {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly editedFilePath: string;
  readonly editedText?: string;
  readonly proposalId?: string;
};

export interface WorkspaceSyncCoordinatorOptions {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly session: WorkspaceSyncSession;
  readonly state: WorkspaceSessionState;
  readonly files: readonly WorkspaceFileInput[];
  readonly dispatchSyntheticReview?: (input: SyntheticReviewInput) => Promise<void>;
  readonly getActiveRuns?: () => readonly RunSnapshotRef[];
  readonly onRunsAborted?: (runIds: readonly string[]) => void;
  readonly onSyntheticCommit?: (commit: SyntheticCommit) => Promise<void> | void;
  readonly onDerivedRebuild?: (input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly snapshot: import('../workspace/sync-engine').WorkspaceSnapshot;
  }) => Promise<void>;
}

function syncRunId(snapshotId: string): string {
  return `sync-${snapshotId}`;
}

function entityId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) {
    return undefined;
  }
  const id = data.id;
  return typeof id === 'string' ? id : undefined;
}

function publishWorkspaceValidity(
  eventBus: RunEventBus,
  runId: string,
  state: WorkspaceSessionState,
): void {
  eventBus.publish({
    type: state.validity === 'invalid' ? 'workspace.invalid' : 'workspace.valid',
    runId,
    emittedAt: new Date().toISOString(),
    data: {
      validity: state.validity,
      snapshotId: state.snapshot.snapshotId,
      ...(state.errors.length === 0 ? {} : { errors: state.errors }),
    },
  });
}

function publishAbortedRuns(
  store: RuntimeStore,
  eventBus: RunEventBus,
  latestCanonicalVersion: string,
  getActiveRuns: (() => readonly RunSnapshotRef[]) | undefined,
  onRunsAborted: ((runIds: readonly string[]) => void) | undefined,
): void {
  if (getActiveRuns === undefined) {
    return;
  }
  const aborted = abortDriftedRuns(getActiveRuns(), latestCanonicalVersion);
  if (aborted.length === 0) {
    return;
  }
  const runIds = aborted.map((decision) => decision.run.runId);
  for (const decision of aborted) {
    store.updateRunStatus(decision.run.runId, 'aborted', 'run-aborted');
    eventBus.publish({
      type: 'run.aborted',
      runId: decision.run.runId,
      emittedAt: new Date().toISOString(),
      data: { reason: decision.driftReason },
    });
  }
  onRunsAborted?.(runIds);
}

async function processProtectedManualEdits(options: WorkspaceSyncCoordinatorOptions, runId: string): Promise<void> {
  if (options.state.changedPaths.length === 0) {
    return;
  }
  const contentByPath = new Map(options.files.map((file) => [file.path, file.content]));
  await Promise.all(options.state.changedPaths.map(async (path) => {
    const entity = options.state.snapshot.entities.get(path);
    const id = entityId(entity?.data);
    const rule = resolveLayoutRuleForPath(path);
    if (id === undefined || rule === undefined) {
      return;
    }
    const artifactType = PROPOSAL_ARTIFACT_TYPE_BY_CANONICAL_KIND[rule.kind] ?? rule.kind;
    const artifact = options.store.getArtifact(artifactType, id);
    const editedText = contentByPath.get(path);
    if (editedText !== undefined && options.store.consumeInternalCanonicalCommit(path, editedText)) {
      return;
    }
    const wasApprovedBeforeEdit = artifact?.proposalStatus === 'approved' || artifact?.proposalStatus === 'override-approved';
    const freshness = await handleHandEditedArtifact({
      workspaceId: options.workspaceId,
      bookId: options.bookId,
      artifactType,
      targetId: id,
      filePath: path,
      wasApprovedBeforeEdit,
      ...(editedText === undefined ? {} : { editedText }),
      ...(artifact?.activeProposalId === undefined ? {} : { proposalId: artifact.activeProposalId }),
    }, options.dispatchSyntheticReview === undefined ? undefined : async (event) => options.dispatchSyntheticReview?.(event.data));
    if (!freshness.stale || artifact === undefined) {
      return;
    }
    options.store.upsertArtifact({ ...artifact, reviewStale: true, updatedAt: new Date().toISOString() });
    options.eventBus.publish({
      type: 'artifact.review-stale',
      runId,
      emittedAt: new Date().toISOString(),
      data: { artifactType, targetId: id, filePath: path, reason: freshness.reason },
    });
  }));
}

/** Reconciles watcher saves with the runtime's snapshot, audit, review, and derived-state contracts. */
export async function coordinateWorkspaceSync(options: WorkspaceSyncCoordinatorOptions): Promise<void> {
  const runId = syncRunId(options.state.snapshot.snapshotId);
  options.store.setLastKnownSnapshot(options.workspaceId, options.state.snapshot);
  options.store.setWorkspaceValidity(options.workspaceId, options.state.validity);
  publishWorkspaceValidity(options.eventBus, runId, options.state);

  if (options.state.validity === 'invalid') {
    return;
  }

  publishAbortedRuns(
    options.store,
    options.eventBus,
    options.state.snapshot.snapshotId,
    options.getActiveRuns,
    options.onRunsAborted,
  );
  await processProtectedManualEdits(options, runId);
  const syntheticCommit = options.session.commitSyntheticSession();
  if (syntheticCommit !== undefined) {
    await options.onSyntheticCommit?.(syntheticCommit);
  }
  if (options.state.changedPaths.length === 0) {
    return;
  }

  try {
    const graph = buildDerivedGraph(options.state.snapshot);
    options.store.setDerivedGraph(graph);
    await options.onDerivedRebuild?.({
      workspaceId: options.workspaceId,
      bookId: options.bookId,
      snapshot: options.state.snapshot,
    });
    options.store.setWorkspaceValidity(options.workspaceId, 'clean');
    options.eventBus.publish({
      type: 'derived.ready',
      runId,
      emittedAt: new Date().toISOString(),
      data: {
        snapshotId: graph.builtFromSnapshotId,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        documentCount: graph.searchDocuments.length,
      },
    });
  } catch (cause) {
    options.eventBus.publish({
      type: 'derived.failed',
      runId,
      emittedAt: new Date().toISOString(),
      data: { snapshotId: options.state.snapshot.snapshotId, reason: cause instanceof Error ? cause.message : String(cause) },
    });
  }
}