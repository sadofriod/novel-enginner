import { describe, expect, test } from 'bun:test';

import { abandonBootstrapSession, canTransitionSession, completeBootstrapSession, transitionBootstrapSession } from './state-machine';

const baseSession = {
  id: 'session-1',
  workspaceId: 'workspace-1',
  bookId: 'book-1',
  path: 'new-book' as const,
  status: 'drafting' as const,
  currentStage: 'market-research' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('bootstrap state machine', () => {
  test('allows valid transitions', () => {
    expect(canTransitionSession('drafting', 'awaiting-approval')).toBe(true);
    expect(canTransitionSession('ready-to-write', 'completed')).toBe(true);
  });

  test('rejects invalid transitions', () => {
    expect(() => transitionBootstrapSession(baseSession, 'completed')).toThrow('Invalid transition');
  });

  test('marks completion and abandonment timestamps', () => {
    const completed = completeBootstrapSession({ ...baseSession, status: 'ready-to-write' });
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();

    const abandoned = abandonBootstrapSession({ ...baseSession, status: 'awaiting-approval' });
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.abandonedAt).toBeDefined();
  });
});
