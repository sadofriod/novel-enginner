import { listPersistedRuns } from '../../../../persistence/operations';
import { formatSseEvent, jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

const TERMINAL_RUN_EVENT_TYPES: ReadonlySet<string> = new Set(['run.completed', 'run.aborted', 'external.failure']);

export interface RunHandlers {
  readonly handleListRuns: () => Promise<Response>;
  readonly handleGetRun: (runId: string) => Response;
  readonly handleRunStream: (runId: string, request: Request) => Response;
}

export function createRunHandlers(deps: RouteHandlerDeps): RunHandlers {
  const { store, eventBus, logger } = deps;

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

  function handleRunStream(runId: string, request: Request): Response {
    logger.debug({ runId }, 'Establishing run event stream');
    const encoder = new TextEncoder();
    const parsed = Number.parseInt(request.headers.get('last-event-id') ?? '', 10);
    const lastEventId = Number.isFinite(parsed) ? parsed : undefined;
    let unsubscribe: (() => void) | undefined;

    const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, event: import('../../../event-bus').RunEvent): void => {
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

  return { handleListRuns, handleGetRun, handleRunStream };
}
