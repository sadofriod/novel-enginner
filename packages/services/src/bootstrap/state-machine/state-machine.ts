/**
 * Bootstrap session state machine.
 * Handles valid state transitions per doc 11.6.
 */
import type { BootstrapStatus, BootstrapStage, BootstrapPath } from '../types';
import {
  NEW_BOOK_STAGE_VALUES,
  IMPORT_STAGE_VALUES,
} from '../types';

export type StateTransitionResult = {
  allowed: boolean;
  reason?: string;
};

const VALID_TRANSITIONS: Record<BootstrapStatus, BootstrapStatus[]> = {
  drafting: ['awaiting-approval', 'abandoned', 'failed'],
  'awaiting-approval': ['advancing', 'ready-to-write', 'import-review', 'abandoned', 'failed'],
  advancing: ['awaiting-approval', 'ready-to-write', 'abandoned', 'failed'],
  'import-review': ['awaiting-approval', 'ready-to-write', 'abandoned', 'failed'],
  'ready-to-write': ['completed', 'abandoned', 'failed'],
  completed: ['abandoned', 'failed'],
  abandoned: ['abandoned'],
  failed: ['failed'],
};

const TERMINAL_STATUSES: BootstrapStatus[] = ['completed', 'abandoned', 'failed'];

function isTerminal(status: BootstrapStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function isAlwaysAllowed(status: BootstrapStatus): boolean {
  return status === 'abandoned' || status === 'failed';
}

function checkTransition(current: BootstrapStatus, next: BootstrapStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export class BootstrapStateMachine {
  /**
   * Validate if a status transition is allowed.
   */
  static isTransitionAllowed(
    currentStatus: BootstrapStatus,
    nextStatus: BootstrapStatus,
  ): StateTransitionResult {
    if (isTerminal(currentStatus) && nextStatus !== currentStatus) {
      return {
        allowed: false,
        reason: `Cannot transition from terminal status ${currentStatus}`,
      };
    }

    if (isAlwaysAllowed(nextStatus)) {
      return { allowed: true };
    }

    if (checkTransition(currentStatus, nextStatus)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Invalid transition from ${currentStatus} to ${nextStatus}`,
    };
  }

  /**
   * Get the initial stage for a new session.
   */
  static getInitialStage(path: BootstrapPath): BootstrapStage {
    return path === 'new-book' ? 'market-research' : 'import-scan';
  }

  /**
   * Get the next stage in the flow.
   */
  static getNextStage(currentStage: BootstrapStage, path: BootstrapPath): BootstrapStage | null {
    const stageList = path === 'new-book' ? NEW_BOOK_STAGE_VALUES : IMPORT_STAGE_VALUES;
    const currentIndex = Array.from(stageList).indexOf(currentStage);

    if (currentIndex === -1 || currentIndex === stageList.length - 1) {
      return null;
    }

    return Array.from(stageList)[currentIndex + 1] as BootstrapStage;
  }

  /**
   * Check if a stage is the last stage in the flow.
   */
  static isLastStage(stage: BootstrapStage, path: BootstrapPath): boolean {
    const stageList = path === 'new-book' ? NEW_BOOK_STAGE_VALUES : IMPORT_STAGE_VALUES;
    return stage === Array.from(stageList)[stageList.length - 1];
  }

  /**
   * Get all stages for a path.
   */
  static getStagesForPath(path: BootstrapPath): BootstrapStage[] {
    return Array.from(path === 'new-book' ? NEW_BOOK_STAGE_VALUES : IMPORT_STAGE_VALUES);
  }

  /**
   * Validate if a stage belongs to a path.
   */
  static isValidStageForPath(stage: BootstrapStage, path: BootstrapPath): boolean {
    const stageList = path === 'new-book' ? NEW_BOOK_STAGE_VALUES : IMPORT_STAGE_VALUES;
    return Array.from(stageList).includes(stage);
  }
}

