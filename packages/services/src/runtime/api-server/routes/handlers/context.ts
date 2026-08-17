import type { Logger } from 'pino';

import type { WorkspaceValidity } from '../../../../domain';
import type { RunEventBus } from '../../../event-bus';
import type { RuntimeStore } from '../../../store';
import type { CreateApiServerOptions } from '../../types';

/** Shared dependencies every route handler group closes over. */
export interface RouteHandlerDeps {
  readonly options: CreateApiServerOptions;
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly logger: Logger;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly persistAcceptedCommand: CreateApiServerOptions['persistAcceptedCommand'];
  readonly loadPersistedCommand: CreateApiServerOptions['loadPersistedCommand'];
  readonly dispatchCommand: CreateApiServerOptions['dispatchCommand'];
  readonly dispatchSyntheticReview: CreateApiServerOptions['dispatchSyntheticReview'];
  readonly reSyncStateOptions: NonNullable<CreateApiServerOptions['reSyncStateOptions']>;
}

/** Handlers that other handler groups need to call (command dispatch cross-refs). */
export interface CommandCrossReferences {
  readonly handlePostCommand: (request: Request) => Promise<Response>;
  readonly handleSyncCommand: (syncIntent: string, request: Request) => Promise<Response>;
}
