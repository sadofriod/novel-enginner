/* eslint-disable complexity */
import { asRecord, jsonResponse } from '../../transport/http';
import { finalizeAcceptedCommand, restorePersistedCommand } from '../../command/command';

import type { RouteHandlerDeps } from './context';

export interface CommandHandlers {
  readonly handlePostCommand: (request: Request) => Promise<Response>;
  readonly handleGetCommand: (commandId: string) => Response;
}

export function createCommandHandlers(deps: RouteHandlerDeps): CommandHandlers {
  const { store, eventBus, logger, getWorkspaceValidity, options, persistAcceptedCommand, loadPersistedCommand, dispatchCommand } = deps;

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
      const validation = (await import('../../../command-handler')).validateCommandEnvelope(payload);
      logger.debug({ validationStatus: 'ok' in validation ? 'valid' : 'error' }, 'Command envelope validated');

      const commandWasKnown = ('ok' in validation && store.findCommandByIdempotencyKey(validation.envelope.idempotencyKey) !== undefined)
        || await restorePersistedCommand(validation, store, eventBus, loadPersistedCommand);

      if (commandWasKnown) {
        logger.debug({ envelope: ('ok' in validation ? validation.envelope : {}), idempotencyKey: 'ok' in validation ? validation.envelope.idempotencyKey : undefined }, 'Command was already known (idempotent)');
      }

      const result = (await import('../../../command-handler')).handleCommand(payload, { store, eventBus, getWorkspaceValidity });

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

  return { handlePostCommand, handleGetCommand };
}
