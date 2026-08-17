import { parseCanonicalMarkdown } from './markdown';
import { resolveLayoutRuleForPath } from './layout';
import { asRecord, fileNameStem, firstString, toRecord } from './content-parsing';

import type { ParsedCanonicalMarkdown } from './markdown';
import type { CanonicalEntityKind } from './layout';
import type { WorkspaceFileInput } from './sync-engine';

export interface WorkspaceEntityDetail {
  readonly kind: CanonicalEntityKind;
  readonly id: string;
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly sections: Readonly<Record<string, string>>;
  readonly scenes: Readonly<Record<string, string>>;
  readonly raw: string;
}

interface EntitySource {
  readonly file: WorkspaceFileInput;
  readonly parsed: ParsedCanonicalMarkdown;
}

function matchEntitySource(
  file: WorkspaceFileInput,
  kind: CanonicalEntityKind,
  id: string,
): EntitySource | undefined {
  const rule = resolveLayoutRuleForPath(file.path);
  if (rule === undefined || rule.kind !== kind) {
    return undefined;
  }
  let parsed: ParsedCanonicalMarkdown;
  try {
    parsed = parseCanonicalMarkdown(file.content);
  } catch {
    return undefined;
  }
  if (entityIdOf(parsed, file.path) !== id) {
    return undefined;
  }
  return { file, parsed };
}

function entityIdOf(parsed: ParsedCanonicalMarkdown, path: string): string {
  return firstString(asRecord(parsed.frontmatter), ['id']) ?? fileNameStem(path);
}

function findEntitySource(
  files: readonly WorkspaceFileInput[],
  kind: CanonicalEntityKind,
  id: string,
): EntitySource | undefined {
  for (const file of files) {
    const source = matchEntitySource(file, kind, id);
    if (source !== undefined) {
      return source;
    }
  }
  return undefined;
}

/** Finds one canonical entity by kind + id and returns its parsed content. */
export function getWorkspaceEntity(
  files: readonly WorkspaceFileInput[],
  kind: CanonicalEntityKind,
  id: string,
): WorkspaceEntityDetail | undefined {
  const source = findEntitySource(files, kind, id);
  if (source === undefined) {
    return undefined;
  }
  const frontmatter = asRecord(source.parsed.frontmatter);
  return {
    kind,
    id,
    path: source.file.path,
    frontmatter,
    sections: toRecord(source.parsed.sections),
    scenes: toRecord(source.parsed.scenes),
    raw: source.file.content,
  };
}
