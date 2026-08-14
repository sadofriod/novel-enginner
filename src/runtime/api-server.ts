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
import type { CommandRecord, RunRecord, ArtifactSummary } from './store';
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
  /**
   * Optional callback for the POST /sync/re-sync-state route. When provided, the server
   * executes a real `reSyncState` pass over the supplied files, triggers
   * `abortDriftedRuns` for any write-related runs whose canonical version is now stale
   * (docs/architecture/modules/04-workflows-and-agents.md §4.5), and returns the result.
   */
  readonly reSyncStateOptions?: {
    readonly getActiveRuns: () => readonly RunSnapshotRef[];
    readonly onRunsAborted?: (runIds: readonly string[]) => void;
    /**
     * Called with the synthetic commit produced by an editing session after each
     * successful re-sync pass that changed at least one canonical file, per
     * docs/architecture/modules/07-api-events-and-runtime.md §7.9: "手工改动经
     * re-sync-state 进入系统时，也要生成一条合成 commit 审计记录".
     */
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
  const persistAcceptedCommand = options.persistAcceptedCommand
    ?? (process.env['DATABASE_URL'] !== undefined
      ? async (envelope: CommandEnvelope, command: CommandRecord, run: RunRecord): Promise<void> => {
          await persistCommand(envelope.workspaceId, envelope.bookId, command);
          await persistRun(run, envelope.intent, envelope.requestedBy, envelope.idempotencyKey);
        }
      : undefined);
  const loadPersistedCommand = options.loadPersistedCommand
    ?? (process.env['DATABASE_URL'] !== undefined
      ? async (workspaceId: string, idempotencyKey: string): Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined> => {
          const command = await findPersistedCommandByIdempotencyKey(workspaceId, idempotencyKey);
          if (command === undefined) {
            return undefined;
          }
          const run = await findPersistedRun(command.runId);
          return run === undefined
            ? { command }
            : { command, run: { ...run, commandId: command.commandId } };
        }
      : undefined);
  const dispatchCommand = options.dispatchCommand
    ?? (process.env['INNGEST_EVENT_KEY'] !== undefined
      ? async (envelope: CommandEnvelope, _run: RunRecord, canonicalVersion?: string): Promise<void> => {
          const { dispatchCommandToInngest } = await import('../workflow/inngest-client');
          await dispatchCommandToInngest(envelope, canonicalVersion);
        }
      : undefined);
  const dispatchSyntheticReview = options.dispatchSyntheticReview
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
  const reSyncStateOptions = options.reSyncStateOptions;
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
    const artifactType = url.searchParams.get('artifactType');
    const targetId = url.searchParams.get('targetId');
    const artifacts = store.listArtifacts();
    const runs = store.listRuns();
    const selectedArtifact = artifactType === null || targetId === null
      ? artifacts[0]
      : artifacts.find((artifact) => artifact.artifactType === artifactType && artifact.targetId === targetId);
    const workspaceId = url.searchParams.get('workspaceId') ?? runs[0]?.workspaceId ?? 'workspace-local';
    const bookId = url.searchParams.get('bookId') ?? runs[0]?.bookId ?? 'book-local';
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

    await handlePostCommand(
      new Request('http://local.test/commands', {
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
      }),
    );
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
      return jsonResponse(
        { status: 'rejected', code: 'invalid-command-envelope', message: 'Request body must be JSON.' },
        400,
      );
    }

    const validation = validateCommandEnvelope(payload);
    let commandWasKnown = 'ok' in validation
      && store.findCommandByIdempotencyKey(validation.envelope.idempotencyKey) !== undefined;
    if ('ok' in validation && loadPersistedCommand !== undefined) {
      const persisted = await loadPersistedCommand(validation.envelope.workspaceId, validation.envelope.idempotencyKey);
      if (persisted !== undefined) {
        commandWasKnown = true;
        store.saveCommand(persisted.command);
        if (persisted.run !== undefined) {
          store.saveRun(persisted.run);
        }
      }
    }
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    if (result.status === 'accepted') {
      const acceptedValidation = validateCommandEnvelope(payload);
      if ('ok' in acceptedValidation) {
        const command = store.getCommand(result.commandId);
        const run = store.getRun(result.runId);
        if (command !== undefined && run !== undefined && persistAcceptedCommand !== undefined) {
          await persistAcceptedCommand(acceptedValidation.envelope, command, run);
        }
        syncArtifactSummary(acceptedValidation.envelope, result);
        await applyPersistedProposalDecision(acceptedValidation.envelope, result.runId);
        if (!commandWasKnown && run !== undefined && dispatchCommand !== undefined) {
          const canonicalVersion = store.getLastKnownSnapshot(acceptedValidation.envelope.workspaceId)?.snapshotId;
          await dispatchCommand(acceptedValidation.envelope, run, canonicalVersion);
        }
      }
    }
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  async function applyPersistedProposalDecision(
    envelope: CommandEnvelope,
    runId: string,
  ): Promise<void> {
    const decisionIntents = new Set(['approve', 'reject', 'override-approve', 'export-draft']);
    if (
      !decisionIntents.has(envelope.intent)
      || envelope.artifactType === undefined
      || envelope.targetId === undefined
    ) {
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
    updateArtifactDecisionStatus(envelope, decision.proposal.status);
    eventBus.publish({
      type: decision.canCommit ? 'artifact.canonical-committed' : 'artifact.approved',
      runId,
      emittedAt: new Date().toISOString(),
      data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status },
    });
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
    const stream = new ReadableStream({
      start(controller) {
        for (const event of eventBus.historyAfter(runId, lastEventId)) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }
        unsubscribe = eventBus.subscribe(runId, (event) => {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        });
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

  function syncArtifactSummary(envelope: CommandEnvelope, result: CommandResult): void {
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

  function updateArtifactDecisionStatus(envelope: CommandEnvelope, proposalStatus: string): void {
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

  async function handleSyncCommand(syncIntent: string, request: Request): Promise<Response> {
    if (syncIntent !== 'rebuild-graph' && syncIntent !== 're-sync-state') {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
    }

    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed !== null && typeof parsed === 'object') {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // Empty body is acceptable for sync commands; validation below reports specifics.
    }

    // docs/architecture/modules/04-workflows-and-agents.md §4.5:
    // When a new canonical snapshot lands via `re-sync-state`, abort all active
    // write-related runs whose `basedOnCanonicalVersion` is now stale.
    if (syncIntent === 're-sync-state' && reSyncStateOptions !== undefined) {
      const files = Array.isArray(body['files'])
        ? (body['files'] as WorkspaceFileInput[])
        : [];

      // Use the per-workspace WorkspaceSyncSession so that repeated saves are
      // aggregated into a single synthetic commit (§2.6).
      const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
      const session = store.getOrCreateSyncSession(workspaceId);
      const sessionState = session.applySave(files);
      store.setLastKnownSnapshot(workspaceId, sessionState.snapshot);

      if (dispatchSyntheticReview !== undefined) {
        const contentByPath = new Map(files.map((file) => [file.path, file.content]));
        await Promise.all(sessionState.changedPaths.map(async (path) => {
          const rule = resolveLayoutRuleForPath(path);
          const entity = sessionState.snapshot.entities.get(path);
          const entityId = entity?.data && typeof entity.data === 'object' && 'id' in entity.data
            ? entity.data.id
            : undefined;
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

      if (sessionState.validity !== 'invalid') {
        const activeRuns = reSyncStateOptions.getActiveRuns();
        const aborted = abortDriftedRuns(activeRuns, sessionState.snapshot.snapshotId);
        if (aborted.length > 0) {
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
          reSyncStateOptions.onRunsAborted?.(abortedIds);
        }

        // docs/architecture/modules/07-api-events-and-runtime.md §7.9:
        // Generate a synthetic commit audit record after a successful re-sync with
        // changed paths.
        const syntheticCommit = session.commitSyntheticSession();
        if (syntheticCommit !== undefined) {
          reSyncStateOptions.onSyntheticCommit?.(syntheticCommit);
        }
      }

      const payload = { ...body, intent: syncIntent, systemTaskType: syncIntent };
      const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });

      // docs/architecture/modules/07-api-events-and-runtime.md §7.6:
      // Emit workspace.valid or workspace.invalid SSE events after a re-sync pass so
      // subscribers on the re-sync run's channel can react to the workspace state change.
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

    const payload = { ...body, intent: syncIntent, systemTaskType: syncIntent };
    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    if (result.status === 'accepted' && syncIntent === 'rebuild-graph' && options.onRebuildGraph !== undefined) {
      const workspaceId = typeof body['workspaceId'] === 'string' ? body['workspaceId'] : 'default';
      const bookId = typeof body['bookId'] === 'string' ? body['bookId'] : 'book-unknown';
      const snapshot = store.getLastKnownSnapshot(workspaceId);
      if (snapshot !== undefined) {
        await options.onRebuildGraph(workspaceId, bookId, snapshot);
      }
    }
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  return { fetch, store, eventBus };
}

function readFormValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveProposalStatus(intent: CommandEnvelope['intent'], workspaceValidity: WorkspaceValidity): string {
  if (intent === 'approve') {
    return workspaceValidity === 'dirty'
      ? 'waiting-sync'
      : workspaceValidity === 'invalid'
        ? 'commit-blocked'
        : 'approved';
  }
  if (intent === 'override-approve') {
    return workspaceValidity === 'dirty'
      ? 'waiting-sync'
      : workspaceValidity === 'invalid'
        ? 'commit-blocked'
        : 'override-approved';
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
