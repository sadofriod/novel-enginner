import type { WorkspaceValidity } from '../domain/values';

import { handleCommand } from './command-handler';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';

export interface CreateApiServerOptions {
  readonly store?: RuntimeStore;
  readonly eventBus?: RunEventBus;
  readonly getWorkspaceValidity?: (workspaceId: string) => WorkspaceValidity;
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
