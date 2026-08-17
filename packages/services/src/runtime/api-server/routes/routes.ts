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
import { createChildLogger } from '../../../common/logger';

const TERMINAL_RUN_EVENT_TYPES: ReadonlySet<string> = new Set(['run.completed', 'run.aborted', 'external.failure']);
const INLINE_EDIT_CHAR_LIMIT = 200;

export function createApiServerRoutes(options: CreateApiServerOptions, store: RuntimeStore, eventBus: RunEventBus): { readonly fetch: (request: Request) => Promise<Response> } {
  const logger = createChildLogger('routes');
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
    handleWebSystemCommand,
    handlePostCommand,
    handleGetCommand,
    handleListRuns,
    handleListArtifacts,
    handleListBootstrapSessions,
    handleGetBootstrapConfig,
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
    const startTime = performance.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    
    try {
      logger.debug({ method, pathname }, 'Incoming HTTP request');
      
      const matched = matchRoute(routes, method, pathname);
      
      if (matched === undefined) {
        const duration = performance.now() - startTime;
        logger.warn({ method, pathname, duration: duration.toFixed(2) }, 'Route not found');
        return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown route.' }, 404);
      }
      
      const response = await matched.route.handle({ api, request, url, params: matched.params });
      const duration = performance.now() - startTime;
      const status = response.status;
      
      logger.info({ method, pathname, status, duration: duration.toFixed(2) }, 'HTTP request completed');
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error({ 
        method, 
        pathname, 
        duration: duration.toFixed(2),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, 'HTTP request failed');
      return jsonResponse({ status: 'rejected', code: 'internal-error', message: 'Internal server error' }, 500);
    }
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
    
    logger.debug({ artifactType, targetId, intent }, 'Web command action received');
    
    if (artifactType === undefined || targetId === undefined || intent === undefined) {
      logger.warn({ artifactType, targetId, intent }, 'Missing required fields in web command action');
      return redirectResponse(redirectTo);
    }
    
    if (intent === 'delete') { 
      logger.info({ artifactType, targetId }, 'Deleting artifact');
      store.deleteArtifact(artifactType, targetId);
      logger.info({ artifactType, targetId }, 'Artifact deleted successfully');
      return redirectResponse('/app'); 
    }
    
    const note = readFormValue(form, 'note');
    if (note !== undefined && [...note].length > INLINE_EDIT_CHAR_LIMIT) {
      logger.warn({ noteLength: [...note].length, limit: INLINE_EDIT_CHAR_LIMIT }, 'Inline edit exceeds character limit');
      return jsonResponse({ status: 'rejected', code: 'inline-edit-too-long', message: `Inline edits are limited to ${INLINE_EDIT_CHAR_LIMIT} characters.` }, 400);
    }
    
    if (note !== undefined && note.trim().length > 0) {
      logger.debug({ artifactType, targetId, noteLength: note.trim().length }, 'Processing inline edit');
      handleInlineEdit(store, artifactType, targetId, note.trim());
      logger.debug({ artifactType, targetId }, 'Inline edit processed');
    }
    
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

  async function handleWebSystemCommand(request: Request): Promise<Response> {
    const form = await request.formData();
    const intent = readFormValue(form, 'intent');
    const workspaceId = readFormValue(form, 'workspaceId');
    const bookId = readFormValue(form, 'bookId');
    const redirectTo = readFormValue(form, 'redirectTo') ?? '/app';
    
    logger.debug({ intent, workspaceId, bookId }, 'Web system command received');
    
    if (intent === undefined || workspaceId === undefined || bookId === undefined) {
      logger.warn({ intent, workspaceId, bookId }, 'Missing required fields in web system command');
      return redirectResponse(redirectTo);
    }
    
    logger.info({ intent, workspaceId, bookId }, 'Processing web system command');
    
    const body = {
      workspaceId,
      bookId,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `web-${intent}-${Date.now().toString(36)}`,
      ...(readFormValue(form, 'artifactType') === undefined ? {} : { artifactType: readFormValue(form, 'artifactType') }),
      ...(readFormValue(form, 'targetId') === undefined ? {} : { targetId: readFormValue(form, 'targetId') }),
      intent,
      systemTaskType: intent === 're-sync-state' || intent === 'rebuild-graph' ? intent : undefined,
    };
    const commandRequest = new Request('http://local.test/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (intent === 're-sync-state' || intent === 'rebuild-graph') {
      await handleSyncCommand(intent, commandRequest);
    } else {
      await handlePostCommand(commandRequest);
    }
    logger.info({ intent }, 'Web system command completed');
    return redirectResponse(redirectTo);
  }

  async function handlePostCommand(request: Request): Promise<Response> {
    const startTime = performance.now();
    let payload: unknown;
    
    try { 
      payload = await request.json();
      logger.debug({ payload }, 'Post command payload received');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to parse command JSON');
      return jsonResponse({ status: 'rejected', code: 'invalid-command-envelope', message: 'Request body must be JSON.' }, 400);
    }
    
    try {
      const validation = (await import('../../command-handler')).validateCommandEnvelope(payload);
      logger.debug({ validationStatus: 'ok' in validation ? 'valid' : 'error' }, 'Command envelope validated');
      
      const commandWasKnown = ('ok' in validation && store.findCommandByIdempotencyKey(validation.envelope.idempotencyKey) !== undefined)
        || await restorePersistedCommand(validation, store, eventBus, loadPersistedCommand);
      
      if (commandWasKnown) {
        logger.debug({ envelope: ('ok' in validation ? validation.envelope : {}), idempotencyKey: 'ok' in validation ? validation.envelope.idempotencyKey : undefined }, 'Command was already known (idempotent)');
      }
      
      const result = (await import('../../command-handler')).handleCommand(payload, { store, eventBus, getWorkspaceValidity });
      
      if (result.status === 'accepted') {
        logger.info({ 
          commandId: result.commandId,
          runId: result.runId,
          intent: 'ok' in validation ? validation.envelope.intent : undefined,
          duration: (performance.now() - startTime).toFixed(2),
        }, 'Command accepted and finalized');
        
        await finalizeAcceptedCommand(validation, result, { store, eventBus, getWorkspaceValidity, persistAcceptedCommand, commandWasKnown, dispatchCommand, payload: asRecord(payload), options });
      } else {
        logger.warn({ 
          code: result.code, 
          message: result.message,
          duration: (performance.now() - startTime).toFixed(2),
        }, 'Command rejected');
      }
      
      return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration: (performance.now() - startTime).toFixed(2),
      }, 'Command processing failed');
      throw error;
    }
  }

  function handleGetCommand(commandId: string): Response {
    logger.debug({ commandId }, 'Fetching command');
    const command = store.getCommand(commandId);
    if (command === undefined) {
      logger.warn({ commandId }, 'Command not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown command.' }, 404);
    }
    logger.debug({ commandId }, 'Command retrieved successfully');
    return jsonResponse(command);
  }

  async function handleListRuns(): Promise<Response> {
    logger.debug('Listing runs');
    if (store.listRuns().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug('No in-memory runs, loading from database');
      const persistedRuns = await listPersistedRuns();
      logger.debug({ count: persistedRuns.length }, 'Persisted runs loaded');
      for (const run of persistedRuns) store.saveRun(run);
    }
    const runs = store.listRuns();
    logger.info({ count: runs.length }, 'Runs listed');
    return jsonResponse(runs);
  }

  function handleListArtifacts(): Response {
    logger.debug('Listing artifacts');
    const artifacts = store.listArtifacts();
    logger.info({ count: artifacts.length }, 'Artifacts listed');
    return jsonResponse(artifacts);
  }

  function handleGetBootstrapConfig(): Response {
    logger.debug('Fetching bootstrap config');
    const config = {
      workspaceId: process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local',
      bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
      workspaceRoot: options.workspaceRoot ?? process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd(),
    };
    logger.info({ workspaceId: config.workspaceId, bookId: config.bookId }, 'Bootstrap config retrieved');
    return jsonResponse(config);
  }

  async function handleListBootstrapSessions(): Promise<Response> {
    logger.debug('Listing bootstrap sessions');
    if (store.listBootstrapSessions().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug('No in-memory bootstrap sessions, loading from database');
      const { listPersistedBootstrapSessions } = await import('../../../bootstrap/repositories/prisma-session-repository');
      const persistedSessions = await listPersistedBootstrapSessions();
      logger.debug({ count: persistedSessions.length }, 'Persisted bootstrap sessions loaded');
      for (const session of persistedSessions) store.upsertBootstrapSession(session);
    }
    const sessions = store.listBootstrapSessions();
    logger.info({ count: sessions.length }, 'Bootstrap sessions listed');
    return jsonResponse(sessions);
  }

  async function handleGetBootstrapSession(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session');
    let session = store.getBootstrapSession(sessionId);
    if (session === undefined && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'Session not in memory, checking database');
      const { findPersistedBootstrapSession } = await import('../../../bootstrap/repositories/prisma-session-repository');
      session = await findPersistedBootstrapSession(sessionId);
      if (session !== undefined) {
        store.upsertBootstrapSession(session);
        logger.debug({ sessionId }, 'Session loaded from database');
      }
    }
    if (session === undefined) {
      logger.warn({ sessionId }, 'Bootstrap session not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: `Unknown bootstrap session "${sessionId}".` }, 404);
    }
    logger.info({ sessionId }, 'Bootstrap session retrieved');
    return jsonResponse(session);
  }

  async function handleGetBootstrapSessionRevisions(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session revisions');
    if (store.listBootstrapRevisions(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'No revisions in memory, loading from database');
      const { listPersistedBootstrapRevisions } = await import('../../../bootstrap/repositories/prisma-session-repository');
      const persistedRevisions = await listPersistedBootstrapRevisions(sessionId);
      logger.debug({ sessionId, count: persistedRevisions.length }, 'Persisted revisions loaded');
      for (const revision of persistedRevisions) store.upsertBootstrapRevision(revision);
    }
    const revisions = store.listBootstrapRevisions(sessionId);
    logger.info({ sessionId, count: revisions.length }, 'Bootstrap revisions retrieved');
    return jsonResponse(revisions);
  }

  async function handleGetBootstrapSessionEvidence(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session evidence');
    if (store.listBootstrapEvidence(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'No evidence in memory, loading from database');
      const { listPersistedBootstrapEvidence } = await import('../../../bootstrap/repositories/prisma-session-repository');
      const persistedEvidence = await listPersistedBootstrapEvidence(sessionId);
      logger.debug({ sessionId, count: persistedEvidence.length }, 'Persisted evidence loaded');
      for (const item of persistedEvidence) store.upsertBootstrapEvidence(item);
    }
    const evidence = store.listBootstrapEvidence(sessionId);
    logger.info({ sessionId, count: evidence.length }, 'Bootstrap evidence retrieved');
    return jsonResponse(evidence);
  }

  function handleGetRun(runId: string): Response {
    logger.debug({ runId }, 'Fetching run');
    const run = store.getRun(runId);
    if (run === undefined) {
      logger.warn({ runId }, 'Run not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown run.' }, 404);
    }
    logger.debug({ runId }, 'Run retrieved successfully');
    return jsonResponse(run);
  }

  function handleGetArtifact(artifactType: string, targetId: string): Response {
    logger.debug({ artifactType, targetId }, 'Fetching artifact');
    const artifact = store.getArtifact(artifactType, targetId);
    if (artifact === undefined) {
      logger.warn({ artifactType, targetId }, 'Artifact not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown artifact.' }, 404);
    }
    logger.debug({ artifactType, targetId }, 'Artifact retrieved successfully');
    return jsonResponse(artifact);
  }

  async function handleGetOverrideAudit(overrideAuditId: string): Promise<Response> {
    logger.debug({ overrideAuditId }, 'Fetching override audit');
    if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') {
      logger.debug('Override audit persistence unavailable');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Override audit persistence is unavailable.' }, 404);
    }
    const audit = await findOverrideAudit(overrideAuditId);
    if (audit === undefined) {
      logger.warn({ overrideAuditId }, 'Override audit not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown override audit.' }, 404);
    }
    logger.info({ overrideAuditId }, 'Override audit retrieved');
    return jsonResponse(audit);
  }

  function handleRunStream(runId: string, request: Request): Response {
    logger.debug({ runId }, 'Establishing run event stream');
    const encoder = new TextEncoder();
    const parsed = Number.parseInt(request.headers.get('last-event-id') ?? '', 10);
    const lastEventId = Number.isFinite(parsed) ? parsed : undefined;
    let unsubscribe: (() => void) | undefined;
    
    const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, event: import('../../event-bus').RunEvent): void => {
      logger.trace({ runId, eventId: event.id, eventType: event.type }, 'Enqueueing event to stream');
      controller.enqueue(encoder.encode(formatSseEvent(event)));
      if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) { 
        logger.debug({ runId, eventType: event.type }, 'Terminal event reached, closing stream');
        unsubscribe?.(); 
        controller.close(); 
      }
    };
    
    const stream = new ReadableStream({
      start(controller) { 
        unsubscribe = eventBus.subscribe(runId, (event) => enqueue(controller, event));
        logger.debug({ runId, lastEventId }, 'Stream subscribed to event bus');
        
        for (const event of eventBus.historyAfter(runId, lastEventId)) { 
          enqueue(controller, event);
          if (TERMINAL_RUN_EVENT_TYPES.has(event.type)) break; 
        }
      },
      cancel() { 
        logger.debug({ runId }, 'Stream cancelled by client');
        unsubscribe?.(); 
      },
    });
    
    logger.info({ runId, lastEventId }, 'Run event stream established');
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
  }

  async function handleSyncCommand(syncIntent: string, request: Request): Promise<Response> {
    logger.debug({ syncIntent }, 'Processing sync command');
    
    if (syncIntent !== 'rebuild-graph' && syncIntent !== 're-sync-state') {
      logger.warn({ syncIntent }, 'Unknown sync intent');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
    }
    
    const body = await readSyncBody(request);
    logger.debug({ syncIntent, workspaceId: body.workspaceId }, 'Sync body parsed');
    
    const { handleCommand } = await import('../../command-handler');
    
    if (syncIntent === 're-sync-state') {
      logger.info({ syncIntent }, 'Handling re-sync-state command');
      return handleReSyncState(body, store, eventBus, getWorkspaceValidity, reSyncStateOptions, dispatchSyntheticReview);
    }
    
    logger.info({ syncIntent }, 'Handling rebuild-graph command');
    const result = handleCommand({ ...body, intent: syncIntent, systemTaskType: syncIntent }, { store, eventBus, getWorkspaceValidity });
    return handleSyncRebuildGraph(body, result, store, eventBus, options);
  }

  return { fetch };
}