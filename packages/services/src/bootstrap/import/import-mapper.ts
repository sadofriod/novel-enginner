import type { BootstrapImportFileEntry } from '../types';

export interface ImportMapping {
  readonly entries: ReadonlyArray<BootstrapImportFileEntry>;
  readonly approved: boolean;
  readonly summary: string;
}

export function createMapping(entries: ReadonlyArray<BootstrapImportFileEntry>): ImportMapping {
  return {
    entries,
    approved: false,
    summary: `已生成 ${entries.length} 个映射条目，等待作者确认。`,
  };
}

export function updateEntry(
  mapping: ImportMapping,
  sourcePath: string,
  updates: Partial<BootstrapImportFileEntry>,
): ImportMapping {
  const entries = mapping.entries.map((entry) => entry.sourcePath === sourcePath ? { ...entry, ...updates } : entry);
  return { ...mapping, entries, summary: `updated ${sourcePath} mapping.` };
}

export function approveMapping(mapping: ImportMapping): ImportMapping {
  return { ...mapping, approved: true, summary: 'approved mapping, ready for import confirmation.' };
}

export function validateMapping(mapping: ImportMapping): boolean {
  return mapping.entries.every((entry) => entry.sourcePath.length > 0 && (entry.canonicalTarget !== undefined || entry.detectedKind === 'reference'));
}
