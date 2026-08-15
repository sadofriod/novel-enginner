/* eslint-disable complexity, max-lines-per-function */
import { findOverrideAudit, listPersistedRuns } from '../../../persistence/operations';
import { matchRoute } from '../../routes/match-route';
import { listRegisteredRoutes } from '../../routes';
import type { RouteApi } from '../../routes/types';
import { RuntimeStore } from '../../store';
import { RunEventBus } from '../../event-bus';
import type { CreateApiServerOptions } from '../types';
import { asRecord, formatSseEvent, jsonResponse, readFormValue, readSyncBody, redirectResponse } from '../transport/http';
import { finalizeAcceptedCommand, restorePersistedCommand } from '../command/command';
import { handleReSyncState, handleSyncRebuildGraph } from '../workspace/workspace';
import { handleInlineEdit } from '../proposal/proposal';

const TERMINAL_RUN_EVENT_TYPES: ReadonlySet<string> = new Set(['run.completed', 'run.aborted', 'external.failure']);
const INLINE_EDIT_CHAR_LIMIT = 200;

export function createApiServerRoutes(options: CreateApiServerOptions, store: RuntimeStore, eventBus: RunEventBus): { readonly fetch: (request: Request) => Promise<Response> } {
  const getWorkspaceValidity = options.getWorkspaceValidity ?? ((workspaceId: string) => store.getWorkspaceValidity(workspaceId));
  const persistAcceptedCommand = options.persistAcceptedCommand;
  const loadPersistedCommand = options.loadPersistedCommand;
  const dispatchCommand = options.dispatchCommand;
  const dispatchSyntheticReview = options.dispatchSyntheticReview;
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
    return matched === undefined
      ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown route.' }, 404)
      : matched.route.handle({ api, request, url, params: matched.params });
  }

  function handleRoot(): Response { return redirectResponse(process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app'); }

  function handleApp(request: Request): Response {
    const targetUrl = new URL(process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app');
    new URL(request.url).searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
    return redirectResponse(targetUrl.toString());
  }

  async function handleWebCommandAction(request: Request): Promise<Response> {
    const form = await request.formData();
    const artifactType = readFormValue(form, 'artifactType');
    const targetId = readFormValue(form, 'targetId');
    const intent = readFormValue(form, 'intent');
    const redirectTo = readFormValue(form, 'redirectTo') ?? '/app';
    if (artifactType === undefined || targetId === undefined || intent === undefined) return redirectResponse(redirectTo);
    if (intent === 'delete') { store.deleteArtifact(artifactType, targetId); return redirectResponse('/app'); }
    const note = readFormValue(form, 'note');
    if (note !== undefined && [...note].length > INLINE_EDIT_CHAR_LIMIT) {
      return jsonResponse({ status: 'rejected', code: 'inline-edit-too-long', message: `Inline edits are limited to ${INLINE_EDIT_CHAR_LIMIT} characters.` }, 400);
    }
    if (note !== undefined && note.trim().length > 0) handleInlineEdit(store, artifactType, targetId, note.trim());
    await handlePostCommand(new Request('http://local.test/commands', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: readFormValue(form, 'workspaceId') ?? 'workspace-local',
        bookId: readFormValue(form, 'bookId') ?? 'book-local', artifactType, targetId, intent,
        requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: `web-${intent}-${targetId}-${Date.now().toString(36)}`,
      }),
    }));
    return redirectResponse(redirectTo);
  }

  async function handlePostCommand(request: Request): Promise<Response> {
    let payload: unknown;
    try { payload = await request.json(); } catch {
      return jsonResponse({ status: 'rejected', code: 'invalid-command-envelope', message: 'Request body must be JSON.' }, 400);
    }
    const validation = (await import('../../command-handler')).validateCommandEnvelope(payload);
    const commandWasKnown = ('ok' in validation && store.findCommandByIdempotencyKey(validation.envelope.idempotencyKey) !== undefined)
      || await restorePersistedCommand(validation, store, eventBus, loadPersistedCommand);
    const result = (await import('../../command-handler')).handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    if (result.status === 'accepted') {
      await finalizeAcceptedCommand(validation, result, { store, eventBus, getWorkspaceValidity, persistAcceptedCommand, commandWasKnown, dispatchCommand, payload: asRecord(payload), options });
    }
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  function handleGetCommand(commandId: string): Response {
    const command = store.getCommand(commandId);
    return command === undefined ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown command.' }, 404) : jsonResponse(command);
  }

  async function handleListRuns(): Promise<Response> {
    if (store.listRuns().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      for (const run of await listPersistedRuns()) store.saveRun(run);
    }
    return jsonResponse(store.listRuns());
  }

  function handleListArtifacts(): Response { return jsonResponse(store.listArtifacts()); }

  async function handleListBootstrapSessions(): Promise<Response> {
    if (store.listBootstrapSessions().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapSessions } = await import('../../../bootstrap/repositories/prisma-session-repository');
      for (const session of await listPersistedBootstrapSessions()) store.upsertBootstrapSession(session);
    }
    return jsonResponse(store.listBootstrapSessions());
  }

  async function handleGetBootstrapSession(sessionId: string): Promise<Response> {
    let session = store.getBootstrapSession(sessionId);
    if (session === undefined && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { findPersistedBootstrapSession } = await import('../../../bootstrap/repositories/prisma-session-repository');
      session = await findPersistedBootstrapSession(sessionId);
      if (session !== undefined) store.upsertBootstrapSession(session);
    }
    return session === undefined
      ? jsonResponse({ status: 'rejected', code: 'not-found', message: `Unknown bootstrap session "${sessionId}".` }, 404)
      : jsonResponse(session);
  }

  async function handleGetBootstrapSessionRevisions(sessionId: string): Promise<Response> {
    if (store.listBootstrapRevisions(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapRevisions } = await import('../../../bootstrap/repositories/prisma-session-repository');
      for (const revision of await listPersistedBootstrapRevisions(sessionId)) store.upsertBootstrapRevision(revision);
    }
    return jsonResponse(store.listBootstrapRevisions(sessionId));
  }

  async function handleGetBootstrapSessionEvidence(sessionId: string): Promise<Response> {
    if (store.listBootstrapEvidence(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      const { listPersistedBootstrapEvidence } = await import('../../../bootstrap/repositories/prisma-session-repository');
      for (const item of await listPersistedBootstrapEvidence(sessionId)) store.upsertBootstrapEvidence(item);
    }
    return jsonResponse(store.listBootstrapEvidence(sessionId));
  }

  function handleGetRun(runId: string): Response {
    const run = store.getRun(runId);
    return run === undefined ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown run.' }, 404) : jsonResponse(run);
  }

  function handleGetArtifact(artifactType: string, targetId: string): Response {
    const artifact = store.getArtifact(artifactType, targetId);
    return artifact === undefined ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown artifact.' }, 404) : jsonResponse(artifact);
  }

  async function handleGetOverrideAudit(overrideAuditId: string): Promise<Response> {
    if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Override audit persistence is unavailable.' }, 404);
    const audit = await findOverrideAudit(overrideAuditId);
    return audit === undefined ? jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown override audit.' }, 404) : jsonResponse(audit);
  }

  function handleRunStream(runId: string, request: Request): Response {
    const encoder = new TextEncoder();
    const parsed = Number.parseInt(request.headers.get('last-event-id') ?? '', 10);
    const lastEventId = Number.isFinite(parsed) ? parsed : undefined;
    let unsubscribe: (() => void) | undefined;
    const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, event: import('../../event-bus').RunEvent): void => {
      controller.enqueue(encoder.encode(formatSseEvent(event)));
      if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) { unsubscribe?.(); controller.close(); }
    };
    const stream = new ReadableStream({
      start(controller) { unsubscribe = eventBus.subscribe(runId, (event) => enqueue(controller, event)); for (const event of eventBus.historyAfter(runId, lastEventId)) { enqueue(controller, event); if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) break; } },
      cancel() { unsubscribe?.(); },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
  }

  async function handleSyncCommand(syncIntent: string, request: Request): Promise<Response> {
    if (syncIntent !== 'rebuild-graph' && syncIntent !== 're-sync-state') return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
    const body = await readSyncBody(request);
    const { handleCommand } = await import('../../command-handler');
    if (syncIntent === 're-sync-state') return handleReSyncState(body, store, eventBus, getWorkspaceValidity, reSyncStateOptions, dispatchSyntheticReview);
    const result = handleCommand({ ...body, intent: syncIntent, systemTaskType: syncIntent }, { store, eventBus, getWorkspaceValidity });
    return handleSyncRebuildGraph(body, result, store, eventBus, options);
  }

  return { fetch };
}