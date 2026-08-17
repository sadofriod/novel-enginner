import { listPersistedRuns } from '../../../../persistence/operations';
import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface RunHandlers {
  readonly handleListRuns: () => Promise<Response>;
  readonly handleGetRun: (runId: string) => Response;
}

export function createRunHandlers(deps: RouteHandlerDeps): RunHandlers {
  const { store, logger } = deps;

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

  return { handleListRuns, handleGetRun };
}
