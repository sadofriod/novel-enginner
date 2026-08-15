import type { BootstrapSession, BootstrapSessionStatus } from '../types';

const TRANSITIONS: Readonly<Record<BootstrapSessionStatus, readonly BootstrapSessionStatus[]>> = {
  drafting: ['awaiting-approval'],
  'awaiting-approval': ['advancing', 'import-review', 'completed', 'abandoned', 'failed'],
  advancing: ['ready-to-write', 'failed'],
  'import-review': ['ready-to-write', 'abandoned', 'failed'],
  'ready-to-write': ['completed', 'abandoned', 'failed'],
  completed: [],
  abandoned: [],
  failed: [],
};

export function canTransitionSession(
  currentStatus: BootstrapSessionStatus,
  nextStatus: BootstrapSessionStatus,
): boolean {
  return TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

export function transitionBootstrapSession(
  session: BootstrapSession,
  nextStatus: BootstrapSessionStatus,
): BootstrapSession {
  if (!canTransitionSession(session.status, nextStatus)) {
    throw new Error(`Invalid transition from ${session.status} to ${nextStatus}`);
  }

  const now = new Date().toISOString();
  return {
    ...session,
    status: nextStatus,
    updatedAt: now,
    completedAt: nextStatus === 'completed' ? now : session.completedAt,
    abandonedAt: nextStatus === 'abandoned' ? now : session.abandonedAt,
    failedAt: nextStatus === 'failed' ? now : session.failedAt,
  };
}

export function abandonBootstrapSession(session: BootstrapSession): BootstrapSession {
  return transitionBootstrapSession(session, 'abandoned');
}

export function completeBootstrapSession(session: BootstrapSession): BootstrapSession {
  return transitionBootstrapSession(session, 'completed');
}
