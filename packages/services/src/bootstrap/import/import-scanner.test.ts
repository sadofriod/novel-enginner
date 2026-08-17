import { describe, expect, test } from 'bun:test';

import { buildMappingSuggestions, recognizeEntity, scanDirectory } from './import-scanner';

describe('bootstrap import scanner', () => {
  test('recognizes known canonical artifacts', () => {
    expect(recognizeEntity('project-brief.md')?.detectedKind).toBe('project-brief');
    expect(recognizeEntity('world-foundation.md')?.detectedKind).toBe('world-foundation');
    expect(recognizeEntity('chapter-01.md')?.detectedKind).toBe('chapter');
  });

  test('builds mapping suggestions and scan summary', () => {
    const suggestions = buildMappingSuggestions(['project-brief.md', 'chapter-02.md', 'notes.md']);
    expect(suggestions).toHaveLength(3);
    const scan = scanDirectory(['project-brief.md', 'notes.md']);
    expect(scan.summary).toContain('2');
  });

  test('generates unique canonical-layout targets for numbered volumes and chapters', () => {
    const suggestions = buildMappingSuggestions(['volume-01.md', 'volume-02.md', 'chapter-001.md', 'chapter-002.md']);
    expect(suggestions.map((entry) => entry.canonicalTarget)).toEqual([
      'state/volumes/volume-001.md',
      'state/volumes/volume-002.md',
      'state/chapters/chapter-0001-outline.md',
      'state/chapters/chapter-0002-outline.md',
    ]);
  });

  test('routes unnumbered chapter candidates to references until an author confirms a mapping', () => {
    expect(buildMappingSuggestions(['chapter-notes.md'])[0]).toMatchObject({
      detectedKind: 'reference',
      canonicalTarget: 'references/imported/chapter-notes-md.md',
      confidence: 0.2,
    });
  });
});
