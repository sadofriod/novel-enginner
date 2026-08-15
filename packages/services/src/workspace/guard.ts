import type { CommandIntent } from '../domain/values';
import type { WorkspaceValidity } from '../domain/values';

import { isWriteBlocked } from './sync-engine';

const WRITE_RELATED_INTENTS: ReadonlySet<CommandIntent> = new Set([
  'propose',
  'regenerate',
  'approve',
  'override-approve',
]);

export interface WorkspaceGuardRejection {
  readonly blocked: true;
  readonly code: 'workspace-dirty' | 'workspace-invalid';
  readonly reason: string;
}

export interface WorkspaceGuardApproval {
  readonly blocked: false;
}

export type WorkspaceGuardResult = WorkspaceGuardRejection | WorkspaceGuardApproval;

function isWriteRelatedIntent(intent: CommandIntent): boolean {
  return WRITE_RELATED_INTENTS.has(intent);
}

function isDeferredApprovalIntent(intent: CommandIntent): boolean {
  return intent === 'approve' || intent === 'override-approve';
}

/**
 * Enforces docs/architecture/modules/02-canonical-workspace.md §2.6 and §10.4:
 * `propose` / `regenerate` must be rejected while the workspace is `dirty` or
 * `invalid`. Dirty approval decisions are allowed through so proposal lifecycle can
 * persist `waiting-sync`; invalid approval decisions remain rejected. Non write-related
 * intents (e.g. re-sync-state itself) are always allowed through so the workspace can recover.
 */
export function guardCommandAgainstWorkspaceValidity(
  intent: CommandIntent,
  validity: WorkspaceValidity,
): WorkspaceGuardResult {
  if (!isWriteRelatedIntent(intent) || !isWriteBlocked(validity)) {
    return { blocked: false };
  }

  if (validity === 'invalid') {
    return {
      blocked: true,
      code: 'workspace-invalid',
      reason: `Command "${intent}" is blocked because the workspace is invalid; fix failing canonical files and re-sync before retrying.`,
    };
  }

  if (isDeferredApprovalIntent(intent)) {
    return { blocked: false };
  }

  return {
    blocked: true,
    code: 'workspace-dirty',
    reason: `Command "${intent}" is blocked because the workspace is dirty; wait for re-sync-state to complete before retrying.`,
  };
}
