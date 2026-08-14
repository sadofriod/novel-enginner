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
});
