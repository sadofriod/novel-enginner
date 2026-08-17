import type { CommandEnvelope } from '../../domain';
import { createChildLogger } from '../../common/logger';

import type { RuntimeStore, CommandRecord, RunRecord } from '../store';

import { nextCommandId, nextRunId } from './ids';
import type {
  CommandAcceptedResponse,
  CommandEnvelopeValidationError,
  HandleCommandDeps,
} from './types';
import { NEXT_EXPECTED_STATE_BY_INTENT } from './types';

export function resolveExistingCommand(
  envelope: CommandEnvelope,
  store: RuntimeStore,
): CommandAcceptedResponse | undefined {
  const existing = store.findCommandByIdempotencyKey(envelope.idempotencyKey);
  if (existing === undefined) {
    return undefined;
  }
  const run = store.getRun(existing.runId);
  return toAcceptedResponse(existing, run, envelope);
}

/* eslint-disable complexity */
export function buildAcceptedRecord(
  envelope: CommandEnvelope,
  acceptedAt: string,
  store: RuntimeStore,
): { commandRecord: CommandRecord; runRecord: RunRecord } {
  const commandId = nextCommandId();
  const runId = nextRunId();
  const nextExpectedState = NEXT_EXPECTED_STATE_BY_INTENT[envelope.intent];
  const basedOnCanonicalVersion = store.getLastKnownSnapshot(envelope.workspaceId)?.snapshotId;
  const commandRecord: CommandRecord = {
    commandId,
    runId,
    idempotencyKey: envelope.idempotencyKey,
    status: 'accepted',
    acceptedAt,
  };
  const runRecord: RunRecord = {
    runId,
    commandId,
    workspaceId: envelope.workspaceId,
    bookId: envelope.bookId,
    ...(envelope.artifactType !== undefined ? { artifactType: envelope.artifactType } : {}),
    ...(envelope.systemTaskType !== undefined ? { systemTaskType: envelope.systemTaskType } : {}),
    ...(envelope.targetId !== undefined ? { targetId: envelope.targetId } : {}),
    intent: envelope.intent,
    ...(basedOnCanonicalVersion === undefined ? {} : { basedOnCanonicalVersion }),
    status: 'accepted',
    nextExpectedState,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  };
  return { commandRecord, runRecord };
}
/* eslint-enable complexity */

export function recordAcceptedCommand(
  deps: HandleCommandDeps,
  commandRecord: CommandRecord,
  runRecord: RunRecord,
  intent: CommandEnvelope['intent'],
  acceptedAt: string,
): void {
  const logger = createChildLogger('command-handler:record');

  logger.debug({ commandId: commandRecord.commandId, runId: runRecord.runId }, 'Saving command and run records');
  deps.store.saveCommand(commandRecord);
  deps.store.saveRun(runRecord);

  logger.debug({ runId: runRecord.runId, commandId: commandRecord.commandId, intent }, 'Publishing command.accepted event');
  deps.eventBus.publish({
    type: 'command.accepted',
    runId: runRecord.runId,
    emittedAt: acceptedAt,
    data: { commandId: commandRecord.commandId, intent },
  });

  logger.debug({ runId: runRecord.runId, commandId: commandRecord.commandId }, 'Publishing run.started event');
  deps.eventBus.publish({
    type: 'run.started',
    runId: runRecord.runId,
    emittedAt: acceptedAt,
    data: { commandId: commandRecord.commandId },
  });
}

/* eslint-disable complexity */
export function toAcceptedResponse(
  command: CommandRecord,
  run: RunRecord | undefined,
  envelope: CommandEnvelope,
): CommandAcceptedResponse {
  const artifactType = run?.artifactType ?? envelope.artifactType;
  const targetId = run?.targetId ?? envelope.targetId;
  const nextExpectedState = run?.nextExpectedState ?? NEXT_EXPECTED_STATE_BY_INTENT[envelope.intent];
  return {
    commandId: command.commandId,
    runId: command.runId,
    acceptedAt: command.acceptedAt,
    status: 'accepted',
    ...(artifactType !== undefined ? { artifactType } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
    nextExpectedState,
    sseChannel: `/runs/${command.runId}/stream`,
  };
}
/* eslint-enable complexity */

export type { CommandEnvelopeValidationError };
