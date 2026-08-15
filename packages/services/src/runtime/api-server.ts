/* eslint-disable complexity, max-lines-per-function */

import type { CommandEnvelope, Proposal } from '../domain';
import type { WorkspaceValidity } from '../domain/values';
import type { BootstrapRevision, BootstrapSession } from '../bootstrap/types';
import { confirmImport } from '../bootstrap/import/confirm-import';
import type { ImportMapping } from '../bootstrap/import/import-mapper';

import { abortDriftedRuns, type RunSnapshotRef } from '../workflow/run-drift';
import { type SyntheticCommit } from '../workspace/session';
import { type WorkspaceFileInput } from '../workspace/sync-engine';
import { handleCommand, validateCommandEnvelope, type CommandResult } from './command-handler';
import { applyBootstrapCommand } from './bootstrap-command-handler';
import {
  findPersistedCommandByIdempotencyKey,
  findPersistedCanonicalDraft,
  listActiveProposalsForBook,
  findActiveProposalForTarget,
  findPersistedRun,
  listPersistedRuns,
  persistCommand,
  persistProposal,
  persistRun,
  persistDerivedRebuildJob,
  findOverrideAudit,
  updatePersistedRunStatus,
} from '../persistence/operations';
import type { CanonicalDraft, CommandRecord, RunRecord } from './store';
import { applyProposalCommand } from '../workflow/command-lifecycle';
import { resolveArtifactWorkflow } from '../workflow/artifact-workflows';
import { buildDerivedGraph } from '../graph/derive';
import { handleHandEditedArtifact } from '../agent/synthetic-review';
import { commitCanonicalFile } from '../workspace/canonical-commit';
import { resolveLayoutRuleForPath } from '../workspace/layout';
import { createApprovedCanonicalDraft } from './canonical-draft';
import { RunEventBus } from './event-bus';
import { listRegisteredRoutes } from './routes';
import { matchRoute } from './routes/match-route';
import type { RouteApi } from './routes/types';
import { RuntimeStore } from './store';

const PROPOSAL_ARTIFACT_TYPE_BY_CANONICAL_KIND: Readonly<Record<string, string>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  character: 'character-update',
  faction: 'faction-update',
  location: 'location-update',
  'tech-rule': 'tech-rule-update',
  fact: 'fact-update',
  relationship: 'relationship-update',
  resource: 'resource-update',
};

const TERMINAL_RUN_EVENT_TYPES: ReadonlySet<string> = new Set(['run.completed', 'run.aborted', 'external.failure']);
const INLINE_EDIT_CHAR_LIMIT = 200;

export interface CreateApiServerOptions {
  readonly store?: RuntimeStore;
  readonly eventBus?: RunEventBus;
  readonly workspaceRoot?: string;
  readonly getWorkspaceValidity?: (workspaceId: string) => WorkspaceValidity;
  readonly persistAcceptedCommand?: (
    envelope: import('../domain').CommandEnvelope,
    command: CommandRecord,
    run: RunRecord,
  ) => Promise<void>;
  readonly loadPersistedCommand?: (
    workspaceId: string,
    idempotencyKey: string,
  ) => Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined>;
  readonly loadActiveProposal?: (
    workspaceId: string,
    bookId: string,
    artifactType: Proposal['artifactType'],
    targetId: string,
  ) => Promise<Proposal | undefined>;
  readonly persistProposalDecision?: (
    workspaceId: string,
    bookId: string,
    proposal: Proposal,
  ) => Promise<void>;
  readonly loadCanonicalDraft?: (proposalId: string) => Promise<CanonicalDraft | undefined>;
  readonly onRebuildGraph?: (
    workspaceId: string,
    bookId: string,
    snapshot: import('../workspace/sync-engine').WorkspaceSnapshot,
  ) => Promise<unknown>;
  readonly dispatchCommand?: (
    envelope: import('../domain').CommandEnvelope,
    run: RunRecord,
    canonicalVersion?: string,
  ) => Promise<void>;
  readonly dispatchSyntheticReview?: (input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly artifactType: string;
    readonly targetId: string;
    readonly editedFilePath: string;
    readonly editedText?: string;
    readonly proposalId?: string;
  }) => Promise<void>;
  readonly persistBootstrapState?: (
    session: BootstrapSession,
    revision?: BootstrapRevision,
  ) => Promise<void>;
  readonly reSyncStateOptions?: {
    readonly getActiveRuns: () => readonly RunSnapshotRef[];
    readonly onRunsAborted?: (runIds: readonly string[]) => void;
    readonly onSyntheticCommit?: (commit: SyntheticCommit) => void;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location },
  });
}

function createPersistAcceptedCommand(
  persistAcceptedCommand: CreateApiServerOptions['persistAcceptedCommand'],
): ((envelope: CommandEnvelope, command: CommandRecord, run: RunRecord) => Promise<void>) | undefined {
  return persistAcceptedCommand
    ?? (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test'
      ? async (envelope: CommandEnvelope, command: CommandRecord, run: RunRecord): Promise<void> => {
          await persistCommand(envelope.workspaceId, envelope.bookId, command);
          await persistRun(run, envelope.intent, envelope.requestedBy, envelope.idempotencyKey);
        }
      : undefined);
}

function createLoadPersistedCommand(
  loadPersistedCommand: CreateApiServerOptions['loadPersistedCommand'],
): ((workspaceId: string, idempotencyKey: string) => Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined>) | undefined {
  return loadPersistedCommand
    ?? (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test'
      ? async (workspaceId: string, idempotencyKey: string): Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined> => {
          const command = await findPersistedCommandByIdempotencyKey(workspaceId, idempotencyKey);
          if (command === undefined) {
            return undefined;
          }
          const run = await findPersistedRun(command.runId);
          return run === undefined ? { command } : { command, run: { ...run, commandId: command.commandId } };
        }
      : undefined);
}

function createDispatchCommand(
  dispatchCommand: CreateApiServerOptions['dispatchCommand'],
): ((envelope: CommandEnvelope, run: RunRecord, canonicalVersion?: string) => Promise<void>) | undefined {
  return dispatchCommand
    ?? (process.env['INNGEST_EVENT_KEY'] !== undefined
      ? async (envelope: CommandEnvelope, _run: RunRecord, canonicalVersion?: string): Promise<void> => {
          const { dispatchCommandToInngest } = await import('../workflow/inngest-client');
          await dispatchCommandToInngest(envelope, canonicalVersion, _run.runId);
        }
      : undefined);
}

function createDispatchSyntheticReview(
  dispatchSyntheticReview: CreateApiServerOptions['dispatchSyntheticReview'],
): ((input: {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly editedFilePath: string;
  readonly editedText?: string;
  readonly proposalId?: string;
}) => Promise<void>) | undefined {
  return dispatchSyntheticReview
    ?? (process.env['INNGEST_EVENT_KEY'] !== undefined
      ? async (input: {
          readonly workspaceId: string;
          readonly bookId: string;
          readonly artifactType: string;
          readonly targetId: string;
          readonly editedFilePath: string;
          readonly editedText?: string;
          readonly proposalId?: string;
        }): Promise<void> => {
          const { dispatchSyntheticReviewToInngest } = await import('../workflow/inngest-client');
          await dispatchSyntheticReviewToInngest(input);
        }
      : undefined);
}

function readFormValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function restorePersistedCommand(
  validation: ReturnType<typeof validateCommandEnvelope>,
  store: RuntimeStore,
  eventBus: RunEventBus,
  loadPersistedCommand: ((workspaceId: string, idempotencyKey: string) => Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined>) | undefined,
): Promise<boolean> {
  if (!('ok' in validation) || loadPersistedCommand === undefined) {
    return false;
  }

  const persisted = await loadPersistedCommand(validation.envelope.workspaceId, validation.envelope.idempotencyKey);
  if (persisted === undefined) {
    return false;
  }

  store.saveCommand(persisted.command);
  if (persisted.run === undefined) {
    return true;
  }

  store.saveRun(persisted.run);
  if (eventBus.history(persisted.run.runId).length > 0) {
    return true;
  }

  const emittedAt = persisted.command.acceptedAt;
  eventBus.publish({
    type: 'command.accepted',
    runId: persisted.run.runId,
    emittedAt,
    data: { commandId: persisted.command.commandId },
  });
  eventBus.publish({
    type: 'run.started',
    runId: persisted.run.runId,
    emittedAt,
    data: { commandId: persisted.command.commandId },
  });
  return true;
}

function readSyncBody(request: Request): Promise<Record<string, unknown>> {
  return request.json().then((parsed) => {
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  }).catch(() => ({}));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function applyConfirmedImport(
  store: RuntimeStore,
  runId: string,
  payload: Record<string, unknown>,
): Promise<readonly import('./event-bus').RunEvent[]> {
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : undefined;
  const sourceRoot = typeof payload['sourceRoot'] === 'string' ? payload['sourceRoot'] : undefined;
  const targetRoot = typeof payload['targetRoot'] === 'string' ? payload['targetRoot'] : undefined;
  if (sessionId === undefined || sourceRoot === undefined || targetRoot === undefined || !('mapping' in payload)) {
    throw new Error('confirm-import requires sessionId, sourceRoot, targetRoot, and mapping.');
  }
  const session = store.getBootstrapSession(sessionId);
  if (session === undefined || session.path !== 'import') {
    throw new Error(`Import Bootstrap session "${sessionId}" was not found.`);
  }
  const result = await confirmImport({ sourceRoot, targetRoot, mapping: payload['mapping'] as ImportMapping });
  const emittedAt = new Date().toISOString();
  const revisionId = `bootstrap-revision-${runId}`;
  store.upsertBootstrapRevision({
    id: revisionId,
    sessionId,
    stage: 'import-health-report',
    createdAt: emittedAt,
    summary: 'Import confirmation completed and health report generated.',
    draft: result.healthReport as unknown as Record<string, unknown>,
  });
  store.upsertBootstrapSession({
    ...session,
    status: 'import-review',
    currentStage: 'import-health-report',
    currentRevisionId: revisionId,
    updatedAt: emittedAt,
  });
  return [
    { type: 'bootstrap.session.updated', runId, emittedAt, data: { sessionId, revisionId } },
    { type: 'bootstrap.stage.changed', runId, emittedAt, data: { sessionId, stage: 'import-health-report' } },
  ];
}

async function persistBootstrapCommandState(
  store: RuntimeStore,
  events: readonly import('./event-bus').RunEvent[],
  persistBootstrapState: CreateApiServerOptions['persistBootstrapState'],
): Promise<void> {
  const sessionId = events.find((event) => typeof event.data?.['sessionId'] === 'string')?.data?.['sessionId'];
  if (typeof sessionId !== 'string') {
    return;
  }
  const session = store.getBootstrapSession(sessionId);
  if (session === undefined) {
    return;
  }
  const revisionId = events.find((event) => typeof event.data?.['revisionId'] === 'string')?.data?.['revisionId'];
  const revision = typeof revisionId === 'string'
    ? store.listBootstrapRevisions(sessionId).find((candidate) => candidate.id === revisionId)
    : undefined;
  if (persistBootstrapState !== undefined) {
    await persistBootstrapState(session, revision);
    return;
  }
  if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') {
    return;
  }
  const { saveBootstrapSessionWithRevision } = await import('../bootstrap/repositories/prisma-session-repository');
  await saveBootstrapSessionWithRevision(session, revision);
}

async function finalizeAcceptedCommand(
  validation: ReturnType<typeof validateCommandEnvelope>,
  result: CommandResult,
  store: RuntimeStore,
  eventBus: RunEventBus,
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity,
  persistAcceptedCommand: ((envelope: CommandEnvelope, command: CommandRecord, run: RunRecord) => Promise<void>) | undefined,
  commandWasKnown: boolean,
  dispatchCommand: ((envelope: CommandEnvelope, run: RunRecord, canonicalVersion?: string) => Promise<void>) | undefined,
  payload: Record<string, unknown>,
  options: CreateApiServerOptions,
): Promise<void> {
  if (!('ok' in validation) || result.status !== 'accepted') {
    return;
  }

  const command = store.getCommand(result.commandId);
  const run = store.getRun(result.runId);
  if (command !== undefined && run !== undefined && persistAcceptedCommand !== undefined) {
    await persistAcceptedCommand(validation.envelope, command, run);
  }
  if (commandWasKnown) {
    return;
  }
  await persistControlledRunStatus(validation.envelope, store);

  const bootstrap = applyBootstrapCommand({
    store,
    envelope: validation.envelope,
    runId: result.runId,
    payload,
  });
  const bootstrapEvents = validation.envelope.intent === 'confirm-import'
    ? [...bootstrap.events, ...await applyConfirmedImport(store, result.runId, payload)]
    : bootstrap.events;
  await persistBootstrapCommandState(store, bootstrapEvents, options.persistBootstrapState);
  for (const event of bootstrapEvents) {
    eventBus.publish(event);
  }

  syncArtifactSummary(store, eventBus, validation.envelope, result, getWorkspaceValidity);
  await applyPersistedProposalDecision({
    store,
    eventBus,
    envelope: validation.envelope,
    runId: result.runId,
    getWorkspaceValidity,
    options,
  });

  const isGenerationIntent = validation.envelope.intent === 'propose' || validation.envelope.intent === 'regenerate';
  if (!commandWasKnown && isGenerationIntent && run !== undefined && dispatchCommand !== undefined) {
    const canonicalVersion = store.getLastKnownSnapshot(validation.envelope.workspaceId)?.snapshotId;
    await dispatchCommand(validation.envelope, run, canonicalVersion);
  }
}

async function persistControlledRunStatus(envelope: CommandEnvelope, store: RuntimeStore): Promise<void> {
  if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test' || envelope.targetId === undefined) {
    return;
  }
  const nextStateByIntent: Readonly<Record<string, { readonly status: string; readonly nextExpectedState: string }>> = {
    'retry-step': { status: 'running', nextExpectedState: 'run-resumed' },
    'resume-run': { status: 'running', nextExpectedState: 'run-resumed' },
    'abort-run': { status: 'aborted', nextExpectedState: 'run-aborted' },
    'mark-external-failure': { status: 'external-failed', nextExpectedState: 'run-aborted' },
  };
  const transition = nextStateByIntent[envelope.intent];
  const run = store.getRun(envelope.targetId);
  if (transition === undefined || run === undefined) {
    return;
  }
  await updatePersistedRunStatus({
    runId: run.runId,
    status: transition.status,
    nextExpectedState: transition.nextExpectedState,
  });
}

async function handleSyncRebuildGraph(
  body: Record<string, unknown>,
  result: CommandResult,
  store: RuntimeStore,
  eventBus: RunEventBus,
  options: CreateApiServerOptions,
): Promise<Response> {
  if (result.status === 'accepted') {
    const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
    const bookId = typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown';
    const snapshot = store.getLastKnownSnapshot(workspaceId);
    if (snapshot !== undefined) {
      const jobId = `derived-rebuild-${result.runId}`;
      if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
        await persistDerivedRebuildJob({
          jobId,
          workspaceId,
          bookId,
          jobType: 'graph-search-embedding',
          status: 'running',
          triggeredBy: 'rebuild-graph',
          runId: result.runId,
        });
      }
      try {
        const derivedGraph = buildDerivedGraph(snapshot);
        if (options.onRebuildGraph !== undefined) {
          await options.onRebuildGraph(workspaceId, bookId, snapshot);
        } else if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
          const { rebuildDerivedSearchIndex } = await import('../graph/embedding-dispatch');
          await rebuildDerivedSearchIndex(snapshot, { workspaceId, bookId });
        }
        store.setDerivedGraph(derivedGraph);
        eventBus.publish({
          type: 'derived.ready',
          runId: result.runId,
          emittedAt: new Date().toISOString(),
          data: {
            snapshotId: derivedGraph.builtFromSnapshotId,
            nodeCount: derivedGraph.nodes.length,
            edgeCount: derivedGraph.edges.length,
            documentCount: derivedGraph.searchDocuments.length,
          },
        });
        if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
          await persistDerivedRebuildJob({
            jobId,
            workspaceId,
            bookId,
            jobType: 'graph-search-embedding',
            status: 'completed',
            runId: result.runId,
          });
        }
      } catch (cause) {
        if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
          await persistDerivedRebuildJob({
            jobId,
            workspaceId,
            bookId,
            jobType: 'graph-search-embedding',
            status: 'failed',
            runId: result.runId,
            errorReason: cause instanceof Error ? cause.message : String(cause),
          });
        }
        throw cause;
      }
    }
  }
  return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
}

async function handleReSyncState(
  request: Request,
  body: Record<string, unknown>,
  store: RuntimeStore,
  eventBus: RunEventBus,
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity,
  reSyncStateOptions: CreateApiServerOptions['reSyncStateOptions'],
  dispatchSyntheticReview: ((input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly artifactType: string;
    readonly targetId: string;
    readonly editedFilePath: string;
    readonly editedText?: string;
    readonly proposalId?: string;
  }) => Promise<void>) | undefined,
): Promise<Response> {
  if (reSyncStateOptions === undefined) {
    return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
  }

  const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
  const payload = { ...body, intent: 're-sync-state', systemTaskType: 're-sync-state' };
  const knownCommand = typeof body['idempotencyKey'] === 'string'
    ? store.findCommandByIdempotencyKey(body['idempotencyKey'])
    : undefined;
  if (knownCommand !== undefined) {
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }
  if (!Array.isArray(body['files'])) {
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }
  const files = body['files'] as WorkspaceFileInput[];
  const session = store.getOrCreateSyncSession(workspaceId);
  const sessionState = session.applySave(files);
  store.setLastKnownSnapshot(workspaceId, sessionState.snapshot);
  store.setWorkspaceValidity(workspaceId, sessionState.validity);

  await maybeDispatchSyntheticReviews({
    body,
    store,
    dispatchSyntheticReview,
    files,
    sessionState,
    workspaceId,
  });

  if (sessionState.validity !== 'invalid') {
    const activeRuns = reSyncStateOptions.getActiveRuns();
    const aborted = abortDriftedRuns(activeRuns, sessionState.snapshot.snapshotId);
    maybePublishAbortedRuns(eventBus, aborted, reSyncStateOptions.onRunsAborted);
    const syntheticCommit = session.commitSyntheticSession();
    if (syntheticCommit !== undefined) {
      reSyncStateOptions.onSyntheticCommit?.(syntheticCommit);
    }
  }
  if (sessionState.validity === 'clean') {
    await requeueBlockedProposals(workspaceId, typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown');
  }

  const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
  if (result.status === 'accepted') {
    const wsEventType = sessionState.validity === 'invalid' ? 'workspace.invalid' : 'workspace.valid';
    eventBus.publish({
      type: wsEventType,
      runId: result.runId,
      emittedAt: new Date().toISOString(),
      data: {
        validity: sessionState.validity,
        snapshotId: sessionState.snapshot.snapshotId,
        ...(sessionState.errors.length > 0 ? { errors: sessionState.errors } : {}),
      },
    });
  }
  const response = result.status === 'accepted'
    ? { ...result, canonicalVersion: sessionState.snapshot.snapshotId }
    : result;
  return jsonResponse(response, result.status === 'accepted' ? 202 : 400);
}

async function requeueBlockedProposals(workspaceId: string, bookId: string): Promise<void> {
  if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') {
    return;
  }
  const proposals = await listActiveProposalsForBook(workspaceId, bookId);
  await Promise.all(proposals.map(async (proposal) => {
    const workflow = resolveArtifactWorkflow(proposal.artifactType);
    if (workflow === undefined) {
      return;
    }
    const recovered = workflow.recoverFromBlocked(proposal, 'clean');
    if (recovered.status !== proposal.status) {
      await persistProposal(workspaceId, bookId, recovered);
    }
  }));
}

async function maybeDispatchSyntheticReviews({
  body,
  store,
  dispatchSyntheticReview,
  files,
  sessionState,
  workspaceId,
}: {
  body: Record<string, unknown>;
  store: RuntimeStore;
  dispatchSyntheticReview: ((input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly artifactType: string;
    readonly targetId: string;
    readonly editedFilePath: string;
    readonly editedText?: string;
    readonly proposalId?: string;
  }) => Promise<void>) | undefined;
  files: WorkspaceFileInput[];
  sessionState: ReturnType<ReturnType<typeof store.getOrCreateSyncSession>['applySave']>;
  workspaceId: string;
}): Promise<void> {
  if (dispatchSyntheticReview === undefined) {
    return;
  }

  const contentByPath = new Map(files.map((file) => [file.path, file.content]));
  await Promise.all(sessionState.changedPaths.map(async (path) => {
    const rule = resolveLayoutRuleForPath(path);
    const entity = sessionState.snapshot.entities.get(path);
    const entityId = entity?.data && typeof entity.data === 'object' && 'id' in entity.data ? entity.data.id : undefined;
    if (rule === undefined || typeof entityId !== 'string') {
      return;
    }

    const artifactType = PROPOSAL_ARTIFACT_TYPE_BY_CANONICAL_KIND[rule.kind] ?? rule.kind;
    const artifact = store.getArtifact(artifactType, entityId);
    if (artifact?.proposalStatus !== 'approved' && artifact?.proposalStatus !== 'override-approved') {
      return;
    }

    const editedText = contentByPath.get(path);
    await handleHandEditedArtifact(
      {
        workspaceId,
        bookId: typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown',
        artifactType,
        targetId: entityId,
        filePath: path,
        wasApprovedBeforeEdit: true,
        ...(editedText !== undefined ? { editedText } : {}),
        ...(artifact.activeProposalId !== undefined ? { proposalId: artifact.activeProposalId } : {}),
      },
      async (event) => dispatchSyntheticReview(event.data),
    );
  }));
}

function maybePublishAbortedRuns(
  eventBus: RunEventBus,
  aborted: ReturnType<typeof abortDriftedRuns>,
  onRunsAborted: ((runIds: readonly string[]) => void) | undefined,
): void {
  if (aborted.length === 0) {
    return;
  }

  const driftReasonById = new Map(aborted.map((d) => [d.run.runId, d.driftReason]));
  const abortedIds = [...driftReasonById.keys()];
  for (const runId of abortedIds) {
    eventBus.publish({
      type: 'run.aborted',
      runId,
      emittedAt: new Date().toISOString(),
      data: { reason: driftReasonById.get(runId) },
    });
  }
  onRunsAborted?.(abortedIds);
}

async function applyPersistedProposalDecision({
  store,
  eventBus,
  envelope,
  runId,
  getWorkspaceValidity,
  options,
}: {
  store: RuntimeStore;
  eventBus: RunEventBus;
  envelope: CommandEnvelope;
  runId: string;
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  options: CreateApiServerOptions;
}): Promise<void> {
  const decisionIntents = new Set(['approve', 'reject', 'override-approve', 'export-draft']);
  if (!decisionIntents.has(envelope.intent) || envelope.artifactType === undefined || envelope.targetId === undefined) {
    return;
  }

  const persistenceEnabled = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
  const loadActiveProposal = options.loadActiveProposal
    ?? (persistenceEnabled ? findActiveProposalForTarget : undefined);
  const proposal = loadActiveProposal === undefined
    ? store.getActiveProposal(envelope.artifactType, envelope.targetId)
    : await loadActiveProposal(envelope.workspaceId, envelope.bookId, envelope.artifactType, envelope.targetId);
  const snapshot = store.getLastKnownSnapshot(envelope.workspaceId);
  if (proposal === undefined || snapshot === undefined) {
    eventBus.publish({
      type: 'run.step.failed',
      runId,
      emittedAt: new Date().toISOString(),
      data: { reason: proposal === undefined ? 'active proposal not found' : 'canonical snapshot not found' },
    });
    return;
  }

  const workspaceValidity = getWorkspaceValidity(envelope.workspaceId);
  const decision = applyProposalCommand({
    envelope,
    proposal,
    currentCanonicalVersion: snapshot.snapshotId,
    workspaceValidity,
  });
  if (!decision.accepted) {
    eventBus.publish({
      type: 'run.step.failed',
      runId,
      emittedAt: new Date().toISOString(),
      data: { reason: decision.reason },
    });
    return;
  }

  if (options.persistProposalDecision !== undefined) {
    await options.persistProposalDecision(envelope.workspaceId, envelope.bookId, decision.proposal);
  } else if (persistenceEnabled) {
    const { persistProposal } = await import('../persistence/operations');
    await persistProposal(envelope.workspaceId, envelope.bookId, decision.proposal);
  } else {
    store.saveProposal(decision.proposal);
  }

  if (decision.canCommit) {
    const loadCanonicalDraft = options.loadCanonicalDraft
      ?? (persistenceEnabled ? findPersistedCanonicalDraft : undefined);
    const commitFailure = await commitApprovedProposalDraft({
      store,
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
      proposal: decision.proposal,
      currentSnapshotId: snapshot.snapshotId,
      workspaceValidity,
      ...(loadCanonicalDraft !== undefined ? { loadCanonicalDraft } : {}),
    });
    if (commitFailure !== undefined) {
      updateArtifactDecisionStatus(store, envelope, decision.proposal.status);
      eventBus.publish({
        type: 'run.step.failed',
        runId,
        emittedAt: new Date().toISOString(),
        data: { reason: commitFailure },
      });
      return;
    }
  }
  updateArtifactDecisionStatus(store, envelope, decision.proposal.status, decision.canCommit);
  eventBus.publish({
    type: resolveProposalDecisionEventType(envelope, decision.proposal.status, decision.canCommit),
    runId,
    emittedAt: new Date().toISOString(),
    data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status },
  });
}

function resolveProposalDecisionEventType(
  envelope: CommandEnvelope,
  proposalStatus: string,
  canonicalCommitted: boolean,
): string {
  if (canonicalCommitted) {
    return 'artifact.canonical-committed';
  }
  if (proposalStatus === 'waiting-sync' || proposalStatus === 'commit-blocked') {
    return 'artifact.commit-blocked';
  }
  if (envelope.intent === 'reject') {
    return 'artifact.rejected';
  }
  if (envelope.intent === 'export-draft') {
    return 'artifact.exported';
  }
  if (envelope.intent === 'override-approve') {
    return 'artifact.override-approved';
  }
  return 'artifact.approved';
}

async function commitApprovedProposalDraft(input: {
  readonly store: RuntimeStore;
  readonly workspaceRoot: string;
  readonly proposal: Proposal;
  readonly currentSnapshotId: string;
  readonly workspaceValidity: WorkspaceValidity;
  readonly loadCanonicalDraft?: (proposalId: string) => Promise<CanonicalDraft | undefined>;
}): Promise<string | undefined> {
  const draft = input.store.getCanonicalDraft(input.proposal.proposalId)
    ?? await input.loadCanonicalDraft?.(input.proposal.proposalId);
  if (draft === undefined) {
    return `canonical draft not found for proposal ${input.proposal.proposalId}`;
  }

  let validatedDraft: CanonicalDraft;
  try {
    validatedDraft = createApprovedCanonicalDraft(draft, input.proposal);
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }

  const result = await commitCanonicalFile({
    workspaceRoot: input.workspaceRoot,
    relativePath: validatedDraft.relativePath,
    content: validatedDraft.content,
    workspaceValidity: input.workspaceValidity,
    proposalSnapshotId: input.proposal.basedOnCanonicalVersion,
    currentSnapshotId: input.currentSnapshotId,
  });
  if (result.committed) {
    input.store.recordInternalCanonicalCommit(validatedDraft.relativePath, validatedDraft.content);
  }
  return result.committed ? undefined : result.reason;
}

function updateArtifactDecisionStatus(
  store: RuntimeStore,
  envelope: CommandEnvelope,
  proposalStatus: string,
  canonicalCommitted = false,
): void {
  if (envelope.artifactType === undefined || envelope.targetId === undefined) {
    return;
  }
  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  store.upsertArtifact({
    ...existing,
    artifactType: envelope.artifactType,
    targetId: envelope.targetId,
    canonicalStatus: canonicalCommitted ? 'approved' : (existing?.canonicalStatus ?? 'draft'),
    proposalStatus,
    updatedAt: new Date().toISOString(),
  });
}

function syncArtifactSummary(
  store: RuntimeStore,
  eventBus: RunEventBus,
  envelope: CommandEnvelope,
  result: CommandResult,
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity,
): void {
  if (result.status !== 'accepted' || envelope.artifactType === undefined || envelope.targetId === undefined) {
    return;
  }

  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  if (envelope.intent === 'propose' || envelope.intent === 'regenerate') {
    store.upsertArtifact({
      ...existing,
      artifactType: envelope.artifactType,
      targetId: envelope.targetId,
      canonicalStatus: existing?.canonicalStatus ?? 'draft',
      activeProposalId: existing?.activeProposalId ?? `proposal-${result.runId}`,
      proposalStatus: 'pending-approval',
      updatedAt: result.acceptedAt,
    });
    return;
  }

  if (envelope.intent !== 'approve' && envelope.intent !== 'override-approve' && envelope.intent !== 'reject' && envelope.intent !== 'export-draft') {
    store.upsertArtifact({
      ...existing,
      artifactType: envelope.artifactType,
      targetId: envelope.targetId,
      canonicalStatus: existing?.canonicalStatus ?? 'draft',
      proposalStatus: resolveProposalStatus(envelope.intent, getWorkspaceValidity(envelope.workspaceId)),
      updatedAt: result.acceptedAt,
    });
  }
}

/**
 * Builds the minimal local HTTP/SSE control surface from
 * docs/architecture/modules/07-api-events-and-runtime.md §7.5. Returns a `fetch`
 * handler suitable for `Bun.serve({ fetch })`, kept framework-free so it can be tested
 * directly without starting a real listener.
 */
export function createApiServer(options: CreateApiServerOptions = {}) {
  const store = options.store ?? new RuntimeStore();
  const eventBus = options.eventBus ?? new RunEventBus();
  const getWorkspaceValidity = options.getWorkspaceValidity ?? ((workspaceId: string) => store.getWorkspaceValidity(workspaceId));
  const persistAcceptedCommand = createPersistAcceptedCommand(options.persistAcceptedCommand);
  const loadPersistedCommand = createLoadPersistedCommand(options.loadPersistedCommand);
  const dispatchCommand = createDispatchCommand(options.dispatchCommand);
  const dispatchSyntheticReview = createDispatchSyntheticReview(options.dispatchSyntheticReview);
  const reSyncStateOptions = options.reSyncStateOptions ?? { getActiveRuns: () => [] };
  const routes = listRegisteredRoutes();

  const api: RouteApi = {
    handleRoot,
    handleApp,
    handleWebCommandAction,
    handlePostCommand,
    handleGetCommand,
    handleListRuns,
    handleListArtifacts,
    handleListBootstrapSessions,
    handleGetBootstrapSession,
    handleGetBootstrapSessionRevisions,
    handleGetBootstrapSessionEvidence,
    handleGetRun,
    handleGetArtifact,
    handleGetOverrideAudit,
    handleRunStream,
    handleSyncCommand,
  };

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const matched = matchRoute(routes, request.method.toUpperCase(), url.pathname);
    if (matched === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown route.' }, 404);
    }
    return matched.route.handle({ api, request, url, params: matched.params });
  }

  function handleRoot(): Response {
    return redirectResponse(process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app');
  }

  function handleApp(request: Request): Response {
    const webAppUrl = process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app';
    const targetUrl = new URL(webAppUrl);
    const sourceUrl = new URL(request.url);
    sourceUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
    return redirectResponse(targetUrl.toString());
  }

  async function handleWebCommandAction(request: Request): Promise<Response> {
    const form = await request.formData();
    const artifactType = readFormValue(form, 'artifactType');
    const targetId = readFormValue(form, 'targetId');
    const intent = readFormValue(form, 'intent');
    const redirectTo = readFormValue(form, 'redirectTo') ?? '/app';
    if (artifactType === undefined || targetId === undefined || intent === undefined) {
      return redirectResponse(redirectTo);
    }

    if (intent === 'delete') {
      store.deleteArtifact(artifactType, targetId);
      return redirectResponse('/app');
    }

    const workspaceId = readFormValue(form, 'workspaceId') ?? 'workspace-local';
    const bookId = readFormValue(form, 'bookId') ?? 'book-local';
    const note = readFormValue(form, 'note');
    if (note !== undefined && [...note].length > INLINE_EDIT_CHAR_LIMIT) {
      return jsonResponse({ status: 'rejected', code: 'inline-edit-too-long', message: `Inline edits are limited to ${INLINE_EDIT_CHAR_LIMIT} characters.` }, 400);
    }
    if (note !== undefined && note.trim().length > 0) {
      applyInlineEditNote(artifactType, targetId, note.trim());
    }

    await handlePostCommand(new Request('http://local.test/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        bookId,
        artifactType,
        targetId,
        intent,
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: `web-${intent}-${targetId}-${Date.now().toString(36)}`,
      }),
    }));
    return redirectResponse(redirectTo);
  }

  function applyInlineEditNote(artifactType: string, targetId: string, inlineEditNote: string): void {
    const artifact = store.getArtifact(artifactType, targetId);
    if (artifact === undefined) {
      return;
    }
    store.upsertArtifact({
      ...artifact,
      inlineEditNote,
      reviewStale: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async function handlePostCommand(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ status: 'rejected', code: 'invalid-command-envelope', message: 'Request body must be JSON.' }, 400);
    }

    const validation = validateCommandEnvelope(payload);
    const commandWasKnown = (('ok' in validation)
      && store.findCommandByIdempotencyKey(validation.envelope.idempotencyKey) !== undefined)
      || await restorePersistedCommand(validation, store, eventBus, loadPersistedCommand);
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    if (result.status === 'accepted') {
      await finalizeAcceptedCommand(
        validation,
        result,
        store,
        eventBus,
        getWorkspaceValidity,
        persistAcceptedCommand,
        commandWasKnown,
        dispatchCommand,
        asRecord(payload),
        options,
      );
    }
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  function handleGetCommand(commandId: string): Response {
    const command = store.getCommand(commandId);
    if (command === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown command.' }, 404);
    }
    return jsonResponse(command);
  }

  async function handleListRuns(): Promise<Response> {
    if (store.listRuns().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const persistedRuns = await listPersistedRuns();
      for (const run of persistedRuns) {
        store.saveRun(run);
      }
    }
    return jsonResponse(store.listRuns());
  }

  function handleListArtifacts(): Response {
    return jsonResponse(store.listArtifacts());
  }

  async function handleListBootstrapSessions(): Promise<Response> {
    if (store.listBootstrapSessions().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapSessions } = await import('../bootstrap/repositories/prisma-session-repository');
      const sessions = await listPersistedBootstrapSessions();
      for (const session of sessions) {
        store.upsertBootstrapSession(session);
      }
    }
    return jsonResponse(store.listBootstrapSessions());
  }

  async function handleGetBootstrapSession(sessionId: string): Promise<Response> {
    let session = store.getBootstrapSession(sessionId);
    if (session === undefined && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { findPersistedBootstrapSession } = await import('../bootstrap/repositories/prisma-session-repository');
      session = await findPersistedBootstrapSession(sessionId);
      if (session !== undefined) {
        store.upsertBootstrapSession(session);
      }
    }
    if (session === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: `Unknown bootstrap session "${sessionId}".` }, 404);
    }
    return jsonResponse(session);
  }

  async function handleGetBootstrapSessionRevisions(sessionId: string): Promise<Response> {
    if (store.listBootstrapRevisions(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapRevisions } = await import('../bootstrap/repositories/prisma-session-repository');
      const revisions = await listPersistedBootstrapRevisions(sessionId);
      for (const revision of revisions) {
        store.upsertBootstrapRevision(revision);
      }
    }
    return jsonResponse(store.listBootstrapRevisions(sessionId));
  }

  async function handleGetBootstrapSessionEvidence(sessionId: string): Promise<Response> {
    if (store.listBootstrapEvidence(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapEvidence } = await import('../bootstrap/repositories/prisma-session-repository');
      const evidence = await listPersistedBootstrapEvidence(sessionId);
      for (const item of evidence) {
        store.upsertBootstrapEvidence(item);
      }
    }
    return jsonResponse(store.listBootstrapEvidence(sessionId));
  }

  function handleGetRun(runId: string): Response {
    const run = store.getRun(runId);
    if (run === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown run.' }, 404);
    }
    return jsonResponse(run);
  }

  function handleGetArtifact(artifactType: string, targetId: string): Response {
    const artifact = store.getArtifact(artifactType, targetId);
    if (artifact === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown artifact.' }, 404);
    }
    return jsonResponse(artifact);
  }

  async function handleGetOverrideAudit(overrideAuditId: string): Promise<Response> {
    if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Override audit persistence is unavailable.' }, 404);
    }
    const audit = await findOverrideAudit(overrideAuditId);
    return audit === undefined
      ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown override audit.' }, 404)
      : jsonResponse(audit);
  }

  function handleRunStream(runId: string, request: Request): Response {
    const encoder = new TextEncoder();
    const lastEventIdHeader = request.headers.get('last-event-id');
    const parsedLastEventId = lastEventIdHeader === null ? undefined : Number.parseInt(lastEventIdHeader, 10);
    const lastEventId = parsedLastEventId !== undefined && Number.isFinite(parsedLastEventId)
      ? parsedLastEventId
      : undefined;
    let unsubscribe: (() => void) | undefined;
    const enqueueEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: import('./event-bus').RunEvent): void => {
      controller.enqueue(encoder.encode(formatSseEvent(event)));
      if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) {
        unsubscribe?.();
        controller.close();
      }
    };
    const stream = new ReadableStream({
      start(controller) {
        unsubscribe = eventBus.subscribe(runId, (event) => {
          enqueueEvent(controller, event);
        });
        for (const event of eventBus.historyAfter(runId, lastEventId)) {
          enqueueEvent(controller, event);
          if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) {
            break;
          }
        }
      },
      cancel() {
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  }

  async function handleSyncCommand(syncIntent: string, request: Request): Promise<Response> {
    if (syncIntent !== 'rebuild-graph' && syncIntent !== 're-sync-state') {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
    }

    const body = await readSyncBody(request);
    if (syncIntent === 're-sync-state') {
      return handleReSyncState(request, body, store, eventBus, getWorkspaceValidity, reSyncStateOptions, dispatchSyntheticReview);
    }

    const payload = { ...body, intent: syncIntent, systemTaskType: syncIntent };
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    return handleSyncRebuildGraph(body, result, store, eventBus, options);
  }

  return { fetch, store, eventBus };
}

function resolveProposalStatus(intent: CommandEnvelope['intent'], workspaceValidity: WorkspaceValidity): string {
  if (intent === 'approve') {
    if (workspaceValidity === 'dirty') {
      return 'waiting-sync';
    }
    if (workspaceValidity === 'invalid') {
      return 'commit-blocked';
    }
    return 'approved';
  }

  if (intent === 'override-approve') {
    if (workspaceValidity === 'dirty') {
      return 'waiting-sync';
    }
    if (workspaceValidity === 'invalid') {
      return 'commit-blocked';
    }
    return 'override-approved';
  }

  if (intent === 'reject') {
    return 'rejected';
  }

  if (intent === 'export-draft') {
    return 'exported';
  }

  return 'pending-approval';
}

function formatSseEvent(event: { readonly type: string; readonly emittedAt: string; readonly data?: Record<string, unknown> }): string {
  const payload = JSON.stringify({ emittedAt: event.emittedAt, ...event.data });
  const idLine = 'id' in event && typeof event.id === 'number' ? `id: ${event.id}\n` : '';
  return `${idLine}event: ${event.type}\ndata: ${payload}\n\n`;
}
