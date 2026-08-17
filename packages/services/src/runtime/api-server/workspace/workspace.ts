/* eslint-disable complexity */
import type { WorkspaceValidity } from '../../../domain/values';
import { abortDriftedRuns } from '../../../workflow/run-drift';
import { buildDerivedGraph } from '../../../graph/derive/build';
import { handleHandEditedArtifact } from '../../../agent/synthetic-review';
import { resolveLayoutRuleForPath } from '../../../workspace/layout';
import type { WorkspaceFileInput } from '../../../workspace/sync-engine';
import { RuntimeStore } from '../../store';
import { RunEventBus } from '../../event-bus';
import type { CommandResult } from '../../command-handler';
import type { CreateApiServerOptions } from '../types';
import { jsonResponse } from '../transport/http';

const ARTIFACT_TYPES: Readonly<Record<string, string>> = { 'project-brief': 'project-brief', 'world-foundation': 'world-foundation', 'story-blueprint': 'story-blueprint', character: 'character-update', faction: 'faction-update', location: 'location-update', 'tech-rule': 'tech-rule-update', fact: 'fact-update', relationship: 'relationship-update', resource: 'resource-update' };

export async function handleSyncRebuildGraph(body: Record<string, unknown>, result: CommandResult, store: RuntimeStore, eventBus: RunEventBus, options: CreateApiServerOptions): Promise<Response> {
  if (result.status === 'accepted') {
    const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
    const bookId = typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown';
    const snapshot = store.getLastKnownSnapshot(workspaceId);
    if (snapshot !== undefined) {
      const graph = buildDerivedGraph(snapshot);
      if (options.onRebuildGraph !== undefined) await options.onRebuildGraph(workspaceId, bookId, snapshot);
      store.setDerivedGraph(graph);
      eventBus.publish({ type: 'derived.ready', runId: result.runId, emittedAt: new Date().toISOString(), data: { snapshotId: graph.builtFromSnapshotId, nodeCount: graph.nodes.length, edgeCount: graph.edges.length, documentCount: graph.searchDocuments.length } });
    }
  }
  return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
}

export async function handleReSyncState(body: Record<string, unknown>, store: RuntimeStore, eventBus: RunEventBus, getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity, options: CreateApiServerOptions['reSyncStateOptions'], dispatchSyntheticReview: CreateApiServerOptions['dispatchSyntheticReview']): Promise<Response> {
  const { handleCommand } = await import('../../command-handler');
  if (options === undefined) return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
  const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
  const payload = { ...body, intent: 're-sync-state', systemTaskType: 're-sync-state' };
  if (!Array.isArray(body['files'])) { const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity }); return jsonResponse(result, result.status === 'accepted' ? 202 : 400); }
  const files = body['files'] as WorkspaceFileInput[];
  const session = store.getOrCreateSyncSession(workspaceId);
  const state = session.applySave(files);
  store.setLastKnownSnapshot(workspaceId, state.snapshot); store.setWorkspaceValidity(workspaceId, state.validity);
  await dispatchReviews(body, files, state, store, dispatchSyntheticReview, workspaceId);
  if (state.validity !== 'invalid') {
    const aborted = abortDriftedRuns(options.getActiveRuns(), state.snapshot.snapshotId);
    for (const item of aborted) eventBus.publish({ type: 'run.aborted', runId: item.run.runId, emittedAt: new Date().toISOString(), data: { reason: item.driftReason } });
    options.onRunsAborted?.(aborted.map((item) => item.run.runId)); options.onSyntheticCommit?.(session.commitSyntheticSession() as never);
  }
  const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
  if (result.status === 'accepted') eventBus.publish({ type: state.validity === 'invalid' ? 'workspace.invalid' : 'workspace.valid', runId: result.runId, emittedAt: new Date().toISOString(), data: { validity: state.validity, snapshotId: state.snapshot.snapshotId, ...(state.errors.length > 0 ? { errors: state.errors } : {}) } });
  return jsonResponse(result.status === 'accepted' ? { ...result, canonicalVersion: state.snapshot.snapshotId } : result, result.status === 'accepted' ? 202 : 400);
}

async function dispatchReviews(body: Record<string, unknown>, files: WorkspaceFileInput[], state: ReturnType<ReturnType<RuntimeStore['getOrCreateSyncSession']>['applySave']>, store: RuntimeStore, dispatch: CreateApiServerOptions['dispatchSyntheticReview'], workspaceId: string): Promise<void> {
  if (dispatch === undefined) return;
  const contents = new Map(files.map((file) => [file.path, file.content]));
  await Promise.all(state.changedPaths.map(async (path) => {
    const rule = resolveLayoutRuleForPath(path); const entity = state.snapshot.entities.get(path); const id = entity?.data && typeof entity.data === 'object' && 'id' in entity.data ? entity.data.id : undefined;
    if (rule === undefined || typeof id !== 'string') return;
    const artifactType = ARTIFACT_TYPES[rule.kind] ?? rule.kind; const artifact = store.getArtifact(artifactType, id);
    if (artifact?.proposalStatus !== 'approved' && artifact?.proposalStatus !== 'override-approved') return;
    const editedText = contents.get(path);
    await handleHandEditedArtifact({ workspaceId, bookId: typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown', artifactType, targetId: id, filePath: path, wasApprovedBeforeEdit: true, ...(editedText === undefined ? {} : { editedText }), ...(artifact.activeProposalId === undefined ? {} : { proposalId: artifact.activeProposalId }) }, async (event) => dispatch(event.data));
  }));
}