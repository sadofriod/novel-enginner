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

const SYSTEM_TASK_INTENTS: ReadonlySet<CommandIntent> = new Set(['rebuild-graph', 're-sync-state']);

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
export function validateCommandEnvelope(
  payload: unknown,
): { readonly ok: true; readonly envelope: CommandEnvelope } | CommandEnvelopeValidationError {
  const parsed = CommandEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'rejected',
      code: 'invalid-command-envelope',
      message: parsed.error.message,
    };
  }

  const envelope = parsed.data;
  const isSystemIntent = SYSTEM_TASK_INTENTS.has(envelope.intent);

  if (isSystemIntent && envelope.artifactType !== undefined) {
    return {
      status: 'rejected',
      code: 'invalid-command-envelope',
      message: `Intent "${envelope.intent}" is a system task and must not set "artifactType".`,
    };
  }

  if (!isSystemIntent && envelope.systemTaskType !== undefined) {
    return {
      status: 'rejected',
      code: 'invalid-command-envelope',
      message: `Intent "${envelope.intent}" is not a system task and must not set "systemTaskType".`,
    };
  }

  if (isSystemIntent && envelope.systemTaskType === undefined) {
    return {
      status: 'rejected',
      code: 'invalid-command-envelope',
      message: `Intent "${envelope.intent}" requires "systemTaskType".`,
    };
  }

  if (!isSystemIntent && envelope.artifactType === undefined) {
    return {
      status: 'rejected',
      code: 'invalid-command-envelope',
      message: `Intent "${envelope.intent}" requires "artifactType".`,
    };
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
export function handleCommand(payload: unknown, deps: HandleCommandDeps): CommandResult {
  const validation = validateCommandEnvelope(payload);
  if (!('ok' in validation)) {
    return validation;
  }
  const { envelope } = validation;

  const existing = deps.store.findCommandByIdempotencyKey(envelope.idempotencyKey);
  if (existing !== undefined) {
    const run = deps.store.getRun(existing.runId);
    return toAcceptedResponse(existing, run, envelope);
  }

  const workspaceValidity = deps.getWorkspaceValidity(envelope.workspaceId);
  const guard = guardCommandAgainstWorkspaceValidity(envelope.intent, workspaceValidity);
  if (guard.blocked) {
    return {
      status: 'rejected',
      code: guard.code,
      message: guard.reason,
    };
  }

  const now = deps.now?.() ?? new Date();
  const acceptedAt = now.toISOString();
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

  deps.store.saveCommand(commandRecord);
  deps.store.saveRun(runRecord);
  deps.eventBus.publish({
    type: 'command.accepted',
    runId,
    emittedAt: acceptedAt,
    data: { commandId, intent: envelope.intent },
  });
  deps.eventBus.publish({
    type: 'run.started',
    runId,
    emittedAt: acceptedAt,
    data: { commandId },
  });

  return toAcceptedResponse(commandRecord, runRecord, envelope);
}

function toAcceptedResponse(
  command: CommandRecord,
  run: RunRecord | undefined,
  envelope: CommandEnvelope,
): CommandAcceptedResponse {
  // Prefer the stored run fields over the incoming envelope so that idempotent replays
  // always reflect the original command that was recorded, not a potentially different
  // payload that happened to share the same idempotencyKey.
  const artifactType = run?.artifactType ?? envelope.artifactType;
  const targetId = run?.targetId ?? envelope.targetId;
  return {
    commandId: command.commandId,
    runId: command.runId,
    acceptedAt: command.acceptedAt,
    status: 'accepted',
    ...(artifactType !== undefined ? { artifactType } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
    nextExpectedState: run?.nextExpectedState ?? NEXT_EXPECTED_STATE_BY_INTENT[envelope.intent],
    sseChannel: `/runs/${command.runId}/stream`,
  };
}
