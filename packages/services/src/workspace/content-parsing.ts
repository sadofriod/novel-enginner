import { parseCanonicalMarkdown } from './markdown';

import type { WorkspaceFileInput } from './sync-engine';

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function firstString(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

export function firstNumber(value: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function fileNameStem(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

export function parseFrontmatter(file: WorkspaceFileInput): Record<string, unknown> {
  try {
    return asRecord(parseCanonicalMarkdown(file.content).frontmatter);
  } catch {
    return {};
  }
}

export function toRecord(map: ReadonlyMap<string, string>): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  for (const [key, value] of map) {
    record[key] = value;
  }
  return record;
}
