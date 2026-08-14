import {
  CommandEnvelopeSchema,
  type CommandEnvelope,
  type CommandIntent,
  type WorkspaceValidity,
} from '../domain';
import { guardCommandAgainstWorkspaceValidity } from '../workspace/guard';

import { RunEventBus } from './event-bus';
import { RuntimeStore, type CommandRecord, type RunRecord } from './store';

export interface CommandAcceptedResponse {
  readonly commandId: string;
  readonly runId: string;
  readonly acceptedAt: string;
  readonly status: 'accepted';
  readonly artifactType?: string;
  readonly targetId?: string;
  readonly nextExpectedState: string;
  readonly sseChannel: string;
}

export interface CommandRejectedResponse {
  readonly status: 'rejected';
  readonly code: string;
  readonly message: string;
}

export type CommandResult = CommandAcceptedResponse | CommandRejectedResponse;

const SYSTEM_TASK_INTENTS: ReadonlySet<CommandIntent> = new Set([
  'rebuild-graph',
  're-sync-state',
  'create-bootstrap-session',
  'continue-bootstrap-session',
  'submit-dialogue-round',
  'submit-market-research',
  'scan-import-directory',
  'confirm-import',
  'discard-bootstrap-session',
]);

/**
 * Maps each `intent` to the `nextExpectedState` the caller should poll/watch for, per
 * docs/architecture/modules/07-api-events-and-runtime.md §7.4. This is intentionally a
 * static table for v1 rather than a full state machine.
 */
const NEXT_EXPECTED_STATE_BY_INTENT: Record<CommandIntent, string> = {
  propose: 'proposal-pending',
  regenerate: 'proposal-pending',
  approve: 'canonical-committed',
  reject: 'proposal-rejected',
  'override-approve': 'canonical-committed',
  'export-draft': 'proposal-exported',
  'rebuild-graph': 'derived-ready',
  're-sync-state': 'workspace-synced',
  'create-bootstrap-session': 'bootstrap-session-created',
  'continue-bootstrap-session': 'bootstrap-session-resumed',
  'submit-dialogue-round': 'bootstrap-draft-saved',
  'submit-market-research': 'market-research-accepted',
  'scan-import-directory': 'bootstrap-import-scanned',
  'confirm-import': 'bootstrap-import-confirmed',
  'discard-bootstrap-session': 'bootstrap-session-abandoned',
  'retry-step': 'run-resumed',
  'resume-run': 'run-resumed',
  'abort-run': 'run-aborted',
  'mark-external-failure': 'run-aborted',
};

export interface CommandEnvelopeValidationError {
  readonly status: 'rejected';
  readonly code: 'invalid-command-envelope';
  readonly message: string;
}

/**
 * Validates a raw command payload against the shared `CommandEnvelopeSchema` plus the
 * cross-field rule from docs/architecture/modules/07-api-events-and-runtime.md §7.2:
 * `artifactType` is only used by proposal/approval intents; system intents
 * (`rebuild-graph`, `re-sync-state`) use `systemTaskType` and may omit
 * `artifactType`/`targetId`.
 */
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
  return undefined;
}

export function validateCommandEnvelope(
  payload: unknown,
): { readonly ok: true; readonly envelope: CommandEnvelope } | CommandEnvelopeValidationError {
  const parsed = CommandEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return invalidEnvelope(parsed.error.message);
  }

  const envelope = parsed.data;
  const isSystemIntent = SYSTEM_TASK_INTENTS.has(envelope.intent);
  const error = isSystemIntent
    ? validateSystemTaskEnvelope(envelope)
    : validateArtifactEnvelope(envelope);

  if (error !== undefined) {
    return error;
  }

  return { ok: true, envelope };
}

let runSequence = 0;
let commandSequence = 0;

function nextRunId(): string {
  runSequence += 1;
  return `run-${runSequence.toString().padStart(6, '0')}`;
}

function nextCommandId(): string {
  commandSequence += 1;
  return `cmd-${commandSequence.toString().padStart(6, '0')}`;
}

export interface HandleCommandDeps {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly now?: () => Date;
}

/**
 * Shared command execution path used by both the HTTP `/commands` route and (in the
 * future) the Bun CLI, so both entry points validate and dispatch through the exact
 * same envelope semantics (docs/architecture/modules/07-api-events-and-runtime.md §7.1).
 */
function resolveExistingCommand(
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

function buildAcceptedRecord(envelope: CommandEnvelope, acceptedAt: string): { commandRecord: CommandRecord; runRecord: RunRecord } {
  const commandId = nextCommandId();
  const runId = nextRunId();
  const nextExpectedState = NEXT_EXPECTED_STATE_BY_INTENT[envelope.intent];
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
    status: 'accepted',
    nextExpectedState,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  };
  return { commandRecord, runRecord };
}

/* eslint-disable complexity */
export function handleCommand(payload: unknown, deps: HandleCommandDeps): CommandResult {
  const validation = validateCommandEnvelope(payload);
  if (!('ok' in validation)) {
    return validation;
  }

  const { envelope } = validation;
  const earlyExit = resolveEarlyCommandExit(validation, deps);
  if (earlyExit !== undefined) {
    return earlyExit;
  }

  const guard = guardCommandAgainstWorkspaceValidity(envelope.intent, deps.getWorkspaceValidity(envelope.workspaceId));
  if (guard.blocked) {
    return {
      status: 'rejected',
      code: guard.code,
      message: guard.reason,
    };
  }

  const now = deps.now?.() ?? new Date();
  const acceptedAt = now.toISOString();
  const { commandRecord, runRecord } = buildAcceptedRecord(envelope, acceptedAt);
  recordAcceptedCommand(deps, commandRecord, runRecord, envelope.intent, acceptedAt);
  applyRunControlIntent(envelope, deps.store, deps.eventBus, acceptedAt);

  return toAcceptedResponse(commandRecord, runRecord, envelope);
}
/* eslint-enable complexity */

function applyRunControlIntent(
  envelope: CommandEnvelope,
  store: RuntimeStore,
  eventBus: RunEventBus,
  emittedAt: string,
): void {
  const controlledRunIntents: Readonly<Record<string, { readonly status: string; readonly nextState: string }>> = {
    'retry-step': { status: 'running', nextState: 'run-resumed' },
    'resume-run': { status: 'running', nextState: 'run-resumed' },
    'abort-run': { status: 'aborted', nextState: 'run-aborted' },
    'mark-external-failure': { status: 'external-failed', nextState: 'run-aborted' },
  };
  const transition = controlledRunIntents[envelope.intent];
  if (transition === undefined || envelope.targetId === undefined) {
    return;
  }
  const controlledRun = store.updateRunStatus(envelope.targetId, transition.status, transition.nextState);
  if (controlledRun === undefined) {
    eventBus.publish({
      type: 'run.step.failed',
      runId: envelope.targetId,
      emittedAt,
      data: { reason: `controlled run ${envelope.targetId} was not found` },
    });
    return;
  }
  publishRunControlEvent(eventBus, controlledRun.runId, envelope.intent, transition.status, emittedAt);
}

function publishRunControlEvent(
  eventBus: RunEventBus,
  runId: string,
  intent: CommandIntent,
  status: string,
  emittedAt: string,
): void {
  const eventType = status === 'aborted'
    ? 'run.aborted'
    : status === 'external-failed'
      ? 'external.failure'
      : undefined;
  if (eventType === undefined) {
    return;
  }
  eventBus.publish({
    type: eventType,
    runId,
    emittedAt,
    data: { reason: `run control intent: ${intent}` },
  });
}

function resolveEarlyCommandExit(
  validation: ReturnType<typeof validateCommandEnvelope>,
  deps: HandleCommandDeps,
): CommandResult | undefined {
  if (!('ok' in validation)) {
    return validation;
  }
  return resolveExistingCommand(validation.envelope, deps.store);
}

function recordAcceptedCommand(
  deps: HandleCommandDeps,
  commandRecord: CommandRecord,
  runRecord: RunRecord,
  intent: CommandEnvelope['intent'],
  acceptedAt: string,
): void {
  deps.store.saveCommand(commandRecord);
  deps.store.saveRun(runRecord);
  deps.eventBus.publish({
    type: 'command.accepted',
    runId: runRecord.runId,
    emittedAt: acceptedAt,
    data: { commandId: commandRecord.commandId, intent },
  });
  deps.eventBus.publish({
    type: 'run.started',
    runId: runRecord.runId,
    emittedAt: acceptedAt,
    data: { commandId: commandRecord.commandId },
  });
}

/* eslint-disable complexity */
function toAcceptedResponse(
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
