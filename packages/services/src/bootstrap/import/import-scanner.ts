import type { BootstrapImportFileEntry } from '../types';

export interface ScanResult {
  readonly entries: ReadonlyArray<BootstrapImportFileEntry>;
  readonly diagnostics: ReadonlyArray<string>;
  readonly summary: string;
}

function toBasename(path: string): string {
  return path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase();
}

function detectProjectBrief(name: string): number {
  return name.includes('project-brief') || name.includes('brief') ? 0.95 : 0;
}

function detectWorldFoundation(name: string): number {
  return name.includes('world') && name.includes('foundation') ? 0.94 : 0;
}

function detectStoryBlueprint(name: string): number {
  return /story.*blueprint|blueprint.*story/.test(name) ? 0.93 : 0;
}

function detectVolume(name: string): number {
  return /(?:volume|vol|book|v)[^\n]*\d+/.test(name) ? 0.9 : 0;
}

function detectChapter(name: string): number {
  return /(?:chapter|chap)[^\n]*\d+/.test(name) ? 0.92 : 0;
}

function detectReference(name: string): number {
  return name.includes('reference') || name.includes('resources') ? 0.75 : 0;
}

function numberFromName(name: string): number | undefined {
  const match = name.match(/\d+/);
  return match === null ? undefined : Number.parseInt(match[0], 10);
}

function paddedTarget(prefix: string, width: number, number: number): string {
  return `${prefix}${number.toString().padStart(width, '0')}`;
}

function volumeTarget(name: string): string | undefined {
  const number = numberFromName(name);
  return number === undefined ? undefined : `state/volumes/${paddedTarget('volume-', 3, number)}.md`;
}

function chapterTarget(name: string): string | undefined {
  const number = numberFromName(name);
  return number === undefined ? undefined : `state/chapters/${paddedTarget('chapter-', 4, number)}-outline.md`;
}

export function recognizeEntity(filePath: string): BootstrapImportFileEntry | undefined {
  const name = toBasename(filePath);
  const detectors = [
    { detector: detectProjectBrief, kind: 'project-brief' as const, target: 'state/book/project-brief.md' },
    { detector: detectWorldFoundation, kind: 'world-foundation' as const, target: 'state/world/world-foundation.md' },
    { detector: detectStoryBlueprint, kind: 'story-blueprint' as const, target: 'state/book/story-blueprint.md' },
    { detector: detectVolume, kind: 'volume' as const, target: volumeTarget(name) },
    { detector: detectChapter, kind: 'chapter' as const, target: chapterTarget(name) },
    { detector: detectReference, kind: 'reference' as const, target: 'references/imported/reference.md' },
  ];

  for (const candidate of detectors) {
    const confidence = candidate.detector(name);
    if (confidence > 0) {
      if (candidate.target === undefined) {
        return {
          sourcePath: filePath,
          detectedKind: 'reference',
          canonicalTarget: undefined,
          confidence: 0.2,
          notes: '无法从文件名稳定提取编号，确认后隔离到 references/imported/，不参与 canonical 生成。',
        };
      }
      return {
        sourcePath: filePath,
        detectedKind: candidate.kind,
        canonicalTarget: candidate.target,
        confidence,
      };
    }
  }

  return undefined;
}

export function buildMappingSuggestions(paths: ReadonlyArray<string>): ReadonlyArray<BootstrapImportFileEntry> {
  return paths.map((path) => recognizeEntity(path) ?? {
    sourcePath: path,
    detectedKind: 'reference',
    canonicalTarget: undefined,
    confidence: 0.2,
    notes: '未识别到标准典型工件，确认后隔离到 references/imported/，不参与 canonical 生成。',
  });
}

export function scanDirectory(paths: ReadonlyArray<string>): ScanResult {
  const entries = buildMappingSuggestions(paths);
  const diagnostics = entries.map((entry) => {
    if (entry.confidence < 0.5) {
      return `文件 ${entry.sourcePath} 未可靠识别，建议人工确认映射。`;
    }
    return `文件 ${entry.sourcePath} 识别为 ${entry.detectedKind}，置信度 ${entry.confidence.toFixed(2)}。`;
  });
  return {
    entries,
    diagnostics,
    summary: `扫描 ${paths.length} 个文件，识别出 ${entries.filter((entry) => entry.confidence >= 0.5).length} 个高置信映射建议。`,
  };
}
