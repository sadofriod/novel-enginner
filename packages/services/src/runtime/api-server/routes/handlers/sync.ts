import { jsonResponse, readSyncBody } from '../../transport/http';
import { handleReSyncState, handleSyncRebuildGraph } from '../../workspace/workspace';

import type { RouteHandlerDeps } from './context';

export interface SyncHandlers {
  readonly handleSyncCommand: (syncIntent: string, request: Request) => Promise<Response>;
}

export function createSyncHandlers(deps: RouteHandlerDeps): SyncHandlers {
  const { store, eventBus, logger, getWorkspaceValidity, options, reSyncStateOptions, dispatchSyntheticReview } = deps;

  async function handleSyncCommand(syncIntent: string, request: Request): Promise<Response> {
    logger.debug({ syncIntent }, 'Processing sync command');

    if (syncIntent !== 'rebuild-graph' && syncIntent !== 're-sync-state') {
      logger.warn({ syncIntent }, 'Unknown sync intent');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown sync route.' }, 404);
    }

    const body = await readSyncBody(request);
    logger.debug({ syncIntent, workspaceId: body.workspaceId }, 'Sync body parsed');

    const { handleCommand } = await import('../../../command-handler');

    if (syncIntent === 're-sync-state') {
      logger.info({ syncIntent }, 'Handling re-sync-state command');
      return handleReSyncState(body, store, eventBus, getWorkspaceValidity, reSyncStateOptions, dispatchSyntheticReview);
    }

    logger.info({ syncIntent }, 'Handling rebuild-graph command');
    const result = handleCommand({ ...body, intent: syncIntent, systemTaskType: syncIntent }, { store, eventBus, getWorkspaceValidity });
    return handleSyncRebuildGraph(body, result, store, eventBus, options);
  }

  return { handleSyncCommand };
}
