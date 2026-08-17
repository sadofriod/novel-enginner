/* eslint-disable complexity */
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import { createChildLogger } from '../common/logger';
import { createApiServerRoutes } from './api-server/routes/routes';
import { createDispatchCommand, createDispatchSyntheticReview, createLoadPersistedCommand, createPersistAcceptedCommand } from './api-server/command/command';
import type { CreateApiServerOptions } from './api-server/types';

export type { CreateApiServerOptions } from './api-server/types';

export function createApiServer(options: CreateApiServerOptions = {}) {
  const logger = createChildLogger('api-server');
  logger.debug('Initializing API server components');

  const store = options.store ?? new RuntimeStore();
  const eventBus = options.eventBus ?? new RunEventBus();
  logger.debug({ storeCreated: options.store === undefined, eventBusCreated: options.eventBus === undefined }, 'Store and event bus initialized');

  const persistAcceptedCommand = createPersistAcceptedCommand(options.persistAcceptedCommand);
  const loadPersistedCommand = createLoadPersistedCommand(options.loadPersistedCommand);
  const dispatchCommand = createDispatchCommand(options.dispatchCommand);
  const dispatchSyntheticReview = createDispatchSyntheticReview(options.dispatchSyntheticReview);
  logger.debug('Command handlers created');

  const configuredOptions: CreateApiServerOptions = {
    ...options,
    ...(persistAcceptedCommand === undefined ? {} : { persistAcceptedCommand }),
    ...(loadPersistedCommand === undefined ? {} : { loadPersistedCommand }),
    ...(dispatchCommand === undefined ? {} : { dispatchCommand }),
    ...(dispatchSyntheticReview === undefined ? {} : { dispatchSyntheticReview }),
  };
  const { fetch } = createApiServerRoutes(configuredOptions, store, eventBus);
  logger.info('API server initialization complete');
  return { fetch, store, eventBus };
}
