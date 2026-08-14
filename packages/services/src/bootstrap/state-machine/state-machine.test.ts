/**
 * Unit tests for bootstrap state machine.
 */
import { describe, test, expect } from 'bun:test';
import { BootstrapStateMachine } from './state-machine';

describe('BootstrapStateMachine', () => {
  describe('isTransitionAllowed', () => {
    test('allows transition from drafting to awaiting-approval', () => {
      const result = BootstrapStateMachine.isTransitionAllowed('drafting', 'awaiting-approval');
      expect(result.allowed).toBe(true);
    });

    test('allows transition to abandoned from any state', () => {
      const states = ['drafting', 'awaiting-approval', 'advancing', 'import-review', 'ready-to-write'];
      states.forEach((state) => {
        const result = BootstrapStateMachine.isTransitionAllowed(state as any, 'abandoned');
        expect(result.allowed).toBe(true);
      });
    });

    test('rejects transition from completed to advancing', () => {
      const result = BootstrapStateMachine.isTransitionAllowed('completed', 'advancing');
      expect(result.allowed).toBe(false);
    });

    test('rejects invalid transition from drafting to ready-to-write', () => {
      const result = BootstrapStateMachine.isTransitionAllowed('drafting', 'ready-to-write');
      expect(result.allowed).toBe(false);
    });
  });

  describe('stage flow', () => {
    test('returns correct initial stage for new-book', () => {
      const stage = BootstrapStateMachine.getInitialStage('new-book');
      expect(stage).toBe('market-research');
    });

    test('returns correct initial stage for import', () => {
      const stage = BootstrapStateMachine.getInitialStage('import');
      expect(stage).toBe('import-scan');
    });

    test('returns correct next stage for new-book path', () => {
      const next = BootstrapStateMachine.getNextStage('market-research', 'new-book');
      expect(next).toBe('inspiration-dialogue');
    });

    test('returns null for last stage', () => {
      const next = BootstrapStateMachine.getNextStage('chapter-outline-batch', 'new-book');
      expect(next).toBeNull();
    });

    test('correctly identifies last stage', () => {
      expect(BootstrapStateMachine.isLastStage('chapter-outline-batch', 'new-book')).toBe(true);
      expect(BootstrapStateMachine.isLastStage('market-research', 'new-book')).toBe(false);
    });
  });

  describe('stage validation', () => {
    test('validates stage for new-book path', () => {
      expect(BootstrapStateMachine.isValidStageForPath('market-research', 'new-book')).toBe(true);
      expect(BootstrapStateMachine.isValidStageForPath('import-scan', 'new-book')).toBe(false);
    });

    test('validates stage for import path', () => {
      expect(BootstrapStateMachine.isValidStageForPath('import-scan', 'import')).toBe(true);
      expect(BootstrapStateMachine.isValidStageForPath('market-research', 'import')).toBe(false);
    });
  });
});
