import type { WorkspaceValidity } from '../../domain/values';

export interface WorkspaceFileError {
  readonly path: string;
  readonly reason: string;
}

export interface CanonicalEntitySnapshot {
  readonly path: string;
  readonly kind: string;
  readonly data: unknown;
  readonly contentHash: string;
}

export interface WorkspaceSnapshot {
  readonly snapshotId: string;
  readonly entities: ReadonlyMap<string, CanonicalEntitySnapshot>;
}

export interface ReSyncStateResult {
  readonly validity: WorkspaceValidity;
  readonly snapshot: WorkspaceSnapshot;
  readonly errors: readonly WorkspaceFileError[];
  readonly changedPaths: readonly string[];
}

export interface WorkspaceFileInput {
  readonly path: string;
  readonly content: string;
}
