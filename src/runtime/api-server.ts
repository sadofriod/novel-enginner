import type { WorkspaceValidity } from '../domain/values';

import { abortDriftedRuns, type RunSnapshotRef } from '../workflow/run-drift';
import { WorkspaceSyncSession, type SyntheticCommit } from '../workspace/session';
import { type WorkspaceFileInput } from '../workspace/sync-engine';
import { handleCommand } from './command-handler';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';

export interface CreateApiServerOptions {
  readonly store?: RuntimeStore;
  readonly eventBus?: RunEventBus;
  readonly getWorkspaceValidity?: (workspaceId: string) => WorkspaceValidity;
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
  const reSyncStateOptions = options.reSyncStateOptions;

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

    if (request.method === 'POST' && segments.length === 1 && segments[0] === 'commands') {
      return handlePostCommand(request);
    }

    if (request.method === 'GET' && segments.length === 2 && segments[0] === 'commands') {
      return handleGetCommand(segments[1] as string);
    }

    if (request.method === 'GET' && segments.length === 1 && segments[0] === 'runs') {
      return jsonResponse(store.listRuns());
    }

    if (request.method === 'GET' && segments.length === 1 && segments[0] === 'artifacts') {
      return jsonResponse(store.listArtifacts());
    }

    if (request.method === 'GET' && segments.length === 2 && segments[0] === 'runs') {
      return handleGetRun(segments[1] as string);
    }

    if (
      request.method === 'GET'
      && segments.length === 3
      && segments[0] === 'runs'
      && segments[2] === 'stream'
    ) {
      return handleRunStream(segments[1] as string);
    }

    if (request.method === 'GET' && segments.length === 3 && segments[0] === 'artifacts') {
      return handleGetArtifact(segments[1] as string, segments[2] as string);
    }

    if (request.method === 'POST' && segments.length === 2 && segments[0] === 'sync') {
      return handleSyncCommand(segments[1] as string, request);
    }

    return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown route.' }, 404);
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

    const result = handleCommand(payload, { store, eventBus, getWorkspaceValidity });
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  function handleGetCommand(commandId: string): Response {
    const command = store.getCommand(commandId);
    if (command === undefined) {
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown command.' }, 404);
    }
    return jsonResponse(command);
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

  function handleRunStream(runId: string): Response {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream({
      start(controller) {
        for (const event of eventBus.history(runId)) {
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
      store.setLastKnownSnapshot(sessionState.snapshot);

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
    return jsonResponse(result, result.status === 'accepted' ? 202 : 400);
  }

  return { fetch, store, eventBus };
}

function formatSseEvent(event: { readonly type: string; readonly emittedAt: string; readonly data?: Record<string, unknown> }): string {
  const payload = JSON.stringify({ emittedAt: event.emittedAt, ...event.data });
  return `event: ${event.type}\ndata: ${payload}\n\n`;
}
