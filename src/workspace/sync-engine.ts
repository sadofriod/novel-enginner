import type { WorkspaceValidity } from '../domain/values';

import { MarkdownContractError, parseCanonicalMarkdown } from './markdown';
import { resolveLayoutRuleForPath } from './layout';

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

function hashContent(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (Math.imul(31, hash) + content.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function parseCanonicalFile(file: WorkspaceFileInput): CanonicalEntitySnapshot {
  const rule = resolveLayoutRuleForPath(file.path);
  if (rule === undefined) {
    throw new MarkdownContractError(`Path "${file.path}" does not match any canonical layout rule.`);
  }

  const parsed = parseCanonicalMarkdown(file.content);
  const result = rule.schema.safeParse(parsed.frontmatter);
  if (!result.success) {
    throw new MarkdownContractError(
      `Frontmatter for "${file.path}" failed ${rule.kind} schema validation: ${result.error.message}`,
    );
  }

  return {
    path: file.path,
    kind: rule.kind,
    data: result.data,
    contentHash: hashContent(file.content),
  };
}

function nextSnapshotId(previous: WorkspaceSnapshot | undefined): string {
  const previousSequence = previous?.snapshotId.split('-').pop();
  const sequenceNumber = previousSequence !== undefined && /^\d+$/.test(previousSequence)
    ? Number.parseInt(previousSequence, 10) + 1
    : 1;
  return `snap-${sequenceNumber.toString().padStart(4, '0')}`;
}

/**
 * Reconciles the current on-disk canonical files against the previous last-known-good
 * snapshot. This is the pure core of the `re-sync-state` flow described in
 * docs/architecture/modules/02-canonical-workspace.md §2.6:
 * - every canonical file is re-parsed and re-validated,
 * - files that fail to parse do not overwrite the last good snapshot for that path,
 * - the workspace becomes `invalid` if any canonical file currently fails validation,
 * - the workspace becomes `dirty` if nothing failed but something changed since the
 *   previous snapshot (still catching up on derived indices),
 * - the workspace is `clean` when nothing changed and nothing is broken.
 */
function ingestFile(
  file: WorkspaceFileInput,
  entities: Map<string, CanonicalEntitySnapshot>,
  changedPaths: string[],
  errors: WorkspaceFileError[],
): void {
  try {
    const entitySnapshot = parseCanonicalFile(file);
    const previousEntity = entities.get(file.path);
    if (previousEntity?.contentHash !== entitySnapshot.contentHash) {
      changedPaths.push(file.path);
    }
    entities.set(file.path, entitySnapshot);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    errors.push({ path: file.path, reason });
  }
}

function removeDeletedEntities(
  entities: Map<string, CanonicalEntitySnapshot>,
  seenPaths: ReadonlySet<string>,
  changedPaths: string[],
): void {
  for (const previousPath of entities.keys()) {
    if (!seenPaths.has(previousPath)) {
      entities.delete(previousPath);
      changedPaths.push(previousPath);
    }
  }
}

function resolveValidity(errors: readonly WorkspaceFileError[], changedPaths: readonly string[]): WorkspaceValidity {
  if (errors.length > 0) {
    return 'invalid';
  }
  return changedPaths.length > 0 ? 'dirty' : 'clean';
}

function ingestCanonicalFiles(
  files: readonly WorkspaceFileInput[],
  entities: Map<string, CanonicalEntitySnapshot>,
): { readonly changedPaths: string[]; readonly errors: WorkspaceFileError[]; readonly seenPaths: Set<string> } {
  const changedPaths: string[] = [];
  const errors: WorkspaceFileError[] = [];
  const seenPaths = new Set<string>();

  for (const file of files) {
    if (resolveLayoutRuleForPath(file.path) === undefined) {
      continue;
    }
    seenPaths.add(file.path);
    ingestFile(file, entities, changedPaths, errors);
  }

  return { changedPaths, errors, seenPaths };
}

function buildSnapshot(
  validity: WorkspaceValidity,
  previousSnapshot: WorkspaceSnapshot | undefined,
  entities: Map<string, CanonicalEntitySnapshot>,
): WorkspaceSnapshot {
  const snapshotId =
    validity === 'invalid'
      ? (previousSnapshot?.snapshotId ?? nextSnapshotId(undefined))
      : nextSnapshotId(previousSnapshot);
  return { snapshotId, entities };
}

export function reSyncState(
  files: readonly WorkspaceFileInput[],
  previousSnapshot?: WorkspaceSnapshot,
): ReSyncStateResult {
  const entities = new Map<string, CanonicalEntitySnapshot>(previousSnapshot?.entities ?? []);
  const { changedPaths, errors, seenPaths } = ingestCanonicalFiles(files, entities);
  removeDeletedEntities(entities, seenPaths, changedPaths);

  const validity = resolveValidity(errors, changedPaths);
  const snapshot = buildSnapshot(validity, previousSnapshot, entities);

  return { validity, snapshot, errors, changedPaths };
}

export function isWriteBlocked(validity: WorkspaceValidity): boolean {
  return validity === 'dirty' || validity === 'invalid';
}
