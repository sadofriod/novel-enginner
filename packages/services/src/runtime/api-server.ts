/* eslint-disable complexity */
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import { createApiServerRoutes } from './api-server/routes/routes';
import { createDispatchCommand, createDispatchSyntheticReview, createLoadPersistedCommand, createPersistAcceptedCommand } from './api-server/command/command';
import type { CreateApiServerOptions } from './api-server/types';

export type { CreateApiServerOptions } from './api-server/types';

export function createApiServer(options: CreateApiServerOptions = {}) {
  const store = options.store ?? new RuntimeStore();
  const eventBus = options.eventBus ?? new RunEventBus();
  const persistAcceptedCommand = createPersistAcceptedCommand(options.persistAcceptedCommand);
  const loadPersistedCommand = createLoadPersistedCommand(options.loadPersistedCommand);
  const dispatchCommand = createDispatchCommand(options.dispatchCommand);
  const dispatchSyntheticReview = createDispatchSyntheticReview(options.dispatchSyntheticReview);
  const configuredOptions: CreateApiServerOptions = {
    ...options,
    ...(persistAcceptedCommand === undefined ? {} : { persistAcceptedCommand }),
    ...(loadPersistedCommand === undefined ? {} : { loadPersistedCommand }),
    ...(dispatchCommand === undefined ? {} : { dispatchCommand }),
    ...(dispatchSyntheticReview === undefined ? {} : { dispatchSyntheticReview }),
  };
  const { fetch } = createApiServerRoutes(configuredOptions, store, eventBus);
  return { fetch, store, eventBus };
}
