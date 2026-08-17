import { guardCommandAgainstWorkspaceValidity } from '../../workspace/guard';
import { createChildLogger } from '../../common/logger';

import { buildAcceptedRecord, recordAcceptedCommand, resolveExistingCommand, toAcceptedResponse } from './record';
import { applyRunControlIntent } from './run-control';
import { validateCommandEnvelope } from './envelope-validation';
import type { CommandResult, HandleCommandDeps } from './types';

function resolveEarlyCommandExit(
  validation: ReturnType<typeof validateCommandEnvelope>,
  deps: HandleCommandDeps,
): CommandResult | undefined {
  if (!('ok' in validation)) {
    return validation;
  }
  return resolveExistingCommand(validation.envelope, deps.store);
}

/* eslint-disable complexity */
export function handleCommand(payload: unknown, deps: HandleCommandDeps): CommandResult {
  const logger = createChildLogger('command-handler:execute');

  const validation = validateCommandEnvelope(payload);
  if (!('ok' in validation)) {
    logger.warn({ code: validation.code, message: validation.message }, 'Command validation failed');
    return validation;
  }

  const { envelope } = validation;
  logger.info({ intent: envelope.intent, workspaceId: envelope.workspaceId, bookId: envelope.bookId }, 'Processing command');

  const earlyExit = resolveEarlyCommandExit(validation, deps);
  if (earlyExit !== undefined) {
    if (earlyExit.status === 'accepted') {
      logger.debug({ intent: envelope.intent, commandId: earlyExit.commandId, runId: earlyExit.runId }, 'Returning existing command (idempotent)');
    } else {
      logger.debug({ intent: envelope.intent, code: earlyExit.code }, 'Returning rejection from early exit');
    }
    return earlyExit;
  }

  const guard = guardCommandAgainstWorkspaceValidity(envelope.intent, deps.getWorkspaceValidity(envelope.workspaceId));
  if (guard.blocked) {
    logger.warn({ intent: envelope.intent, guardCode: guard.code, reason: guard.reason }, 'Command blocked by workspace validity guard');
    return {
      status: 'rejected',
      code: guard.code,
      message: guard.reason,
    };
  }

  const now = deps.now?.() ?? new Date();
  const acceptedAt = now.toISOString();
  const { commandRecord, runRecord } = buildAcceptedRecord(envelope, acceptedAt, deps.store);

  logger.debug({
    commandId: commandRecord.commandId,
    runId: runRecord.runId,
    intent: envelope.intent,
  }, 'Accepting command');

  recordAcceptedCommand(deps, commandRecord, runRecord, envelope.intent, acceptedAt);
  applyRunControlIntent(envelope, deps.store, deps.eventBus, acceptedAt);

  logger.info({
    commandId: commandRecord.commandId,
    runId: runRecord.runId,
    intent: envelope.intent,
    nextExpectedState: runRecord.nextExpectedState,
  }, 'Command accepted');

  return toAcceptedResponse(commandRecord, runRecord, envelope);
}
/* eslint-enable complexity */
