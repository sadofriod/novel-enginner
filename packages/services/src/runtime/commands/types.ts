import type { CommandEnvelope, CommandIntent, WorkspaceValidity } from '../../domain';

import type { RunEventBus } from '../event-bus';
import type { RuntimeStore, CommandRecord, RunRecord } from '../store';

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

export interface HandleCommandDeps {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly now?: () => Date;
}

export interface CommandEnvelopeValidationError {
  readonly status: 'rejected';
  readonly code: 'invalid-command-envelope';
  readonly message: string;
}

export const SYSTEM_TASK_INTENTS: ReadonlySet<CommandIntent> = new Set([
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
export const NEXT_EXPECTED_STATE_BY_INTENT: Record<CommandIntent, string> = {
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

export type { CommandEnvelope, CommandRecord, RunRecord };
