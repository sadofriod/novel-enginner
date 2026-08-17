import { CommandEnvelopeSchema, type CommandEnvelope } from '../../domain';
import { createChildLogger } from '../../common/logger';

import type { CommandEnvelopeValidationError } from './types';
import { SYSTEM_TASK_INTENTS } from './types';

function invalidEnvelope(message: string): CommandEnvelopeValidationError {
  return {
    status: 'rejected',
    code: 'invalid-command-envelope',
    message,
  };
}

function validateSystemTaskEnvelope(envelope: CommandEnvelope): CommandEnvelopeValidationError | undefined {
  if (envelope.artifactType !== undefined) {
    return invalidEnvelope(`Intent "${envelope.intent}" is a system task and must not set "artifactType".`);
  }
  if (envelope.systemTaskType === undefined) {
    return invalidEnvelope(`Intent "${envelope.intent}" requires "systemTaskType".`);
  }
  return undefined;
}

function validateArtifactEnvelope(envelope: CommandEnvelope): CommandEnvelopeValidationError | undefined {
  if (envelope.systemTaskType !== undefined) {
    return invalidEnvelope(`Intent "${envelope.intent}" is not a system task and must not set "systemTaskType".`);
  }
  if (envelope.artifactType === undefined) {
    return invalidEnvelope(`Intent "${envelope.intent}" requires "artifactType".`);
  }
  if (envelope.targetId === undefined) {
    return invalidEnvelope(`Intent "${envelope.intent}" requires "targetId".`);
  }
  return undefined;
}

/**
 * Validates a raw command payload against the shared `CommandEnvelopeSchema` plus the
 * cross-field rule from docs/architecture/modules/07-api-events-and-runtime.md §7.2:
 * `artifactType` is only used by proposal/approval intents; system intents
 * (`rebuild-graph`, `re-sync-state`) use `systemTaskType` and may omit
 * `artifactType`/`targetId`.
 */
export function validateCommandEnvelope(
  payload: unknown,
): { readonly ok: true; readonly envelope: CommandEnvelope } | CommandEnvelopeValidationError {
  const logger = createChildLogger('command-handler:validate');

  const parsed = CommandEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ error: parsed.error.message }, 'Command envelope schema validation failed');
    return invalidEnvelope(parsed.error.message);
  }

  const envelope = parsed.data;
  logger.debug({ intent: envelope.intent, workspaceId: envelope.workspaceId, bookId: envelope.bookId }, 'Command envelope schema parsed');

  const isSystemIntent = SYSTEM_TASK_INTENTS.has(envelope.intent);
  const error = isSystemIntent
    ? validateSystemTaskEnvelope(envelope)
    : validateArtifactEnvelope(envelope);

  if (error !== undefined) {
    logger.warn({ intent: envelope.intent, error: error.message }, 'Command envelope cross-field validation failed');
    return error;
  }

  logger.debug({ intent: envelope.intent, isSystemIntent }, 'Command envelope validation successful');
  return { ok: true, envelope };
}
