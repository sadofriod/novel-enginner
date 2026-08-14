/* eslint-disable complexity, max-lines-per-function */

import type { CommandEnvelope } from '../domain';
import type { WorkspaceValidity } from '../domain/values';

import { abortDriftedRuns, type RunSnapshotRef } from '../workflow/run-drift';
import { type SyntheticCommit } from '../workspace/session';
import { type WorkspaceFileInput } from '../workspace/sync-engine';
import { handleCommand, validateCommandEnvelope, type CommandResult } from './command-handler';
import {
  findPersistedCommandByIdempotencyKey,
  findActiveProposalForTarget,
  findPersistedRun,
  persistCommand,
  persistRun,
} from '../persistence/operations';
import type { ArtifactSummary, CommandRecord, RunRecord } from './store';
import { applyProposalCommand } from '../workflow/command-lifecycle';
import { handleHandEditedArtifact } from '../agent/synthetic-review';
import { resolveLayoutRuleForPath } from '../workspace/layout';
import { renderControlConsolePage } from '../web/app/pages/ControlConsolePage';
import { RunEventBus } from './event-bus';
import { listRegisteredRoutes } from './routes';
import { matchRoute } from './routes/match-route';
import type { RouteApi } from './routes/types';
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

const TERMINAL_RUN_EVENT_TYPES: ReadonlySet<string> = new Set(['run.completed', 'run.aborted', 'external.failure']);

export interface CreateApiServerOptions {
  readonly store?: RuntimeStore;
  readonly eventBus?: RunEventBus;
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

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
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
    ?? (process.env['DATABASE_URL'] !== undefined
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
    ?? (process.env['DATABASE_URL'] !== undefined
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
          await dispatchCommandToInngest(envelope, canonicalVersion);
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

function resolveSelectedArtifact(
  artifacts: readonly ArtifactSummary[],
  artifactType: string | null,
  targetId: string | null,
): ArtifactSummary | undefined {
  if (artifactType === null || targetId === null) {
    return artifacts[0];
  }
  return artifacts.find((artifact) => artifact.artifactType === artifactType && artifact.targetId === targetId);
}

function resolveWorkspaceId(url: URL, fallbackWorkspaceId: string): string {
  return url.searchParams.get('workspaceId') ?? fallbackWorkspaceId;
}

function resolveBookId(url: URL, fallbackBookId: string): string {
  return url.searchParams.get('bookId') ?? fallbackBookId;
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

async function finalizeAcceptedCommand(
  validation: ReturnType<typeof validateCommandEnvelope>,
  result: CommandResult,
  store: RuntimeStore,
  eventBus: RunEventBus,
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity,
  persistAcceptedCommand: ((envelope: CommandEnvelope, command: CommandRecord, run: RunRecord) => Promise<void>) | undefined,
  commandWasKnown: boolean,
  dispatchCommand: ((envelope: CommandEnvelope, run: RunRecord, canonicalVersion?: string) => Promise<void>) | undefined,
): Promise<void> {
  if (!('ok' in validation) || result.status !== 'accepted') {
    return;
  }

  const command = store.getCommand(result.commandId);
  const run = store.getRun(result.runId);
  if (command !== undefined && run !== undefined && persistAcceptedCommand !== undefined) {
    await persistAcceptedCommand(validation.envelope, command, run);
  }

  syncArtifactSummary(store, eventBus, validation.envelope, result, getWorkspaceValidity);
  await applyPersistedProposalDecision({
    store,
    eventBus,
    envelope: validation.envelope,
    runId: result.runId,
    getWorkspaceValidity,
  });

  if (!commandWasKnown && run !== undefined && dispatchCommand !== undefined) {
    const canonicalVersion = store.getLastKnownSnapshot(validation.envelope.workspaceId)?.snapshotId;
    await dispatchCommand(validation.envelope, run, canonicalVersion);
  }
}

async function handleSyncRebuildGraph(
  body: Record<string, unknown>,
  result: CommandResult,
  store: RuntimeStore,
  options: CreateApiServerOptions,
): Promise<Response> {
  if (result.status === 'accepted' && options.onRebuildGraph !== undefined) {
    const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
    const bookId = typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown';
    const snapshot = store.getLastKnownSnapshot(workspaceId);
    if (snapshot !== undefined) {
      await options.onRebuildGraph(workspaceId, bookId, snapshot);
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
  const files = Array.isArray(body['files']) ? (body['files'] as WorkspaceFileInput[]) : [];
  const session = store.getOrCreateSyncSession(workspaceId);
  const sessionState = session.applySave(files);
  store.setLastKnownSnapshot(workspaceId, sessionState.snapshot);

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

  const payload = { ...body, intent: 're-sync-state', systemTaskType: 're-sync-state' };
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
  return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
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
}: {
  store: RuntimeStore;
  eventBus: RunEventBus;
  envelope: CommandEnvelope;
  runId: string;
  getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
}): Promise<void> {
  const decisionIntents = new Set(['approve', 'reject', 'override-approve', 'export-draft']);
  if (!decisionIntents.has(envelope.intent) || envelope.artifactType === undefined || envelope.targetId === undefined) {
    return;
  }

  const proposal = process.env['DATABASE_URL'] === undefined
    ? undefined
    : await findActiveProposalForTarget(envelope.workspaceId, envelope.artifactType, envelope.targetId);
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

  const decision = applyProposalCommand({
    envelope,
    proposal,
    currentCanonicalVersion: snapshot.snapshotId,
    workspaceValidity: getWorkspaceValidity(envelope.workspaceId),
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

  if (process.env['DATABASE_URL'] !== undefined) {
    const { persistProposal } = await import('../persistence/operations');
    await persistProposal(envelope.workspaceId, envelope.bookId, decision.proposal);
  }
  updateArtifactDecisionStatus(store, envelope, decision.proposal.status);
  eventBus.publish({
    type: decision.canCommit ? 'artifact.canonical-committed' : 'artifact.approved',
    runId,
    emittedAt: new Date().toISOString(),
    data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status },
  });
}

function updateArtifactDecisionStatus(store: RuntimeStore, envelope: CommandEnvelope, proposalStatus: string): void {
  if (envelope.artifactType === undefined || envelope.targetId === undefined) {
    return;
  }
  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  if (existing === undefined) {
    return;
  }
  store.upsertArtifact({
    ...existing,
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

  store.upsertArtifact({
    ...existing,
    artifactType: envelope.artifactType,
    targetId: envelope.targetId,
    proposalStatus: resolveProposalStatus(envelope.intent, getWorkspaceValidity(envelope.workspaceId)),
    updatedAt: result.acceptedAt,
  });
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
  const getWorkspaceValidity = options.getWorkspaceValidity ?? (() => 'clean' as WorkspaceValidity);
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
    handleGetRun,
    handleGetArtifact,
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
    return redirectResponse('/app');
  }

  function handleApp(request: Request): Response {
    const url = new URL(request.url);
    const artifacts = store.listArtifacts();
    const runs = store.listRuns();
    const selectedArtifact = resolveSelectedArtifact(
      artifacts,
      url.searchParams.get('artifactType'),
      url.searchParams.get('targetId'),
    );
    const workspaceId = resolveWorkspaceId(url, runs[0]?.workspaceId ?? 'workspace-local');
    const bookId = resolveBookId(url, runs[0]?.bookId ?? 'book-local');
    return htmlResponse(renderControlConsolePage({ artifacts, runs, selectedArtifact, workspaceId, bookId }));
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

  function handleListRuns(): Response {
    return jsonResponse(store.listRuns());
  }

  function handleListArtifacts(): Response {
    return jsonResponse(store.listArtifacts());
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
    return handleSyncRebuildGraph(body, result, store, options);
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
