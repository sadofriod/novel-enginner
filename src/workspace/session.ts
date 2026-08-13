import type { WorkspaceValidity } from '../domain/values';

import { isWriteBlocked, reSyncState, type ReSyncStateResult, type WorkspaceFileInput, type WorkspaceSnapshot } from './sync-engine';

export interface SyntheticCommit {
  readonly commitId: string;
  readonly snapshotId: string;
  readonly changedPaths: readonly string[];
}

export interface WorkspaceSessionState {
  readonly validity: WorkspaceValidity;
  readonly snapshot: WorkspaceSnapshot;
  readonly pendingCommit?: SyntheticCommit;
  readonly errors: ReSyncStateResult['errors'];
}

/**
 * Tracks one editing-session worth of re-sync-state activity so that repeated saves of
 * the same or related files are aggregated into a single synthetic commit instead of
 * one commit per save (docs/architecture/modules/02-canonical-workspace.md §2.6).
 */
export class WorkspaceSyncSession {
  private snapshot: WorkspaceSnapshot | undefined;
  private validity: WorkspaceValidity = 'clean';
  private pendingChangedPaths = new Set<string>();
  private commitSequence = 0;
  private errors: ReSyncStateResult['errors'] = [];

  constructor(initialSnapshot?: WorkspaceSnapshot) {
    this.snapshot = initialSnapshot;
  }

  /** Re-runs re-sync-state over the given files and folds the result into this session. */
  applySave(files: readonly WorkspaceFileInput[]): WorkspaceSessionState {
    const result = reSyncState(files, this.snapshot);
    this.snapshot = result.snapshot;
    this.validity = result.validity;
    this.errors = result.errors;

    for (const path of result.changedPaths) {
      this.pendingChangedPaths.add(path);
    }

    return this.toState();
  }

  /**
   * Finalizes the aggregated changes accumulated since the last commit into a single
   * synthetic commit. No-ops (returns undefined) when there is nothing pending or the
   * workspace is currently invalid, since invalid saves must never become canonical.
   */
  commitSyntheticSession(): SyntheticCommit | undefined {
    if (this.validity === 'invalid' || this.pendingChangedPaths.size === 0) {
      return undefined;
    }

    this.commitSequence += 1;
    const commit: SyntheticCommit = {
      commitId: `synthetic-${this.commitSequence.toString().padStart(4, '0')}`,
      snapshotId: this.snapshot?.snapshotId ?? 'snap-0000',
      changedPaths: [...this.pendingChangedPaths],
    };
    this.pendingChangedPaths.clear();
    return commit;
  }

  getState(): WorkspaceSessionState {
    return this.toState();
  }

  isWriteBlocked(): boolean {
    return isWriteBlocked(this.validity);
  }

  private toState(): WorkspaceSessionState {
    const base: WorkspaceSessionState = {
      validity: this.validity,
      snapshot: this.snapshot ?? { snapshotId: 'snap-0000', entities: new Map() },
      errors: this.errors,
    };
    if (this.pendingChangedPaths.size === 0) {
      return base;
    }
    return {
      ...base,
      pendingCommit: {
        commitId: 'pending',
        snapshotId: base.snapshot.snapshotId,
        changedPaths: [...this.pendingChangedPaths],
      },
    };
  }
}
