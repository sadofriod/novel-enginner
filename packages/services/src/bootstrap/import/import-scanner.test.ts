import { describe, test, expect } from 'bun:test';
import { BootstrapImportScanner, type FileScanResult } from './import-scanner';

describe('BootstrapImportScanner', () => {
  const scanner = new BootstrapImportScanner();

  test('recognizes project-brief from filename', () => {
    const result = scanner.recognizeEntity('/docs', 'project-brief.md');
    expect(result.type).toBe('project-brief');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test('recognizes world-foundation from filename', () => {
    const result = scanner.recognizeEntity('/docs', 'world-foundation.md');
    expect(result.type).toBe('world-foundation');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test('recognizes story-blueprint from filename variations', () => {
    const test1 = scanner.recognizeEntity('/docs', 'story-blueprint.md');
    expect(test1.type).toBe('story-blueprint');

    const test2 = scanner.recognizeEntity('/docs', 'Story Outline.md');
    expect(test2.type).toBe('story-blueprint');

    const test3 = scanner.recognizeEntity('/docs', 'novel-structure.md');
    expect(test3.type).toBe('story-blueprint');
  });

  test('recognizes volume patterns', () => {
    const test1 = scanner.recognizeEntity('/docs', 'volume-1.md');
    expect(test1.type).toBe('volume');
    expect(test1.suggestedMapping).toBe('volume-1');

    const test2 = scanner.recognizeEntity('/docs', 'Volume 2.md');
    expect(test2.type).toBe('volume');
    expect(test2.suggestedMapping).toMatch(/volume-2/);

    const test3 = scanner.recognizeEntity('/docs', 'Book-3-story.md');
    expect(test3.type).toBe('volume');
    expect(test3.suggestedMapping).toMatch(/volume-3/);
  });

  test('recognizes chapter patterns', () => {
    const test1 = scanner.recognizeEntity('/docs', 'chapter-5.md');
    expect(test1.type).toBe('chapter');
    expect(test1.suggestedMapping).toBe('chapter-5');

    const test2 = scanner.recognizeEntity('/docs', 'Chapter 10.md');
    expect(test2.type).toBe('chapter');
    expect(test2.suggestedMapping).toMatch(/chapter-10/);

    const test3 = scanner.recognizeEntity('/docs', 'Ch. 15 - The Beginning.md');
    expect(test3.type).toBe('chapter');
    expect(test3.suggestedMapping).toMatch(/chapter-15/);
  });

  test('defaults to reference for unknown files', () => {
    const result = scanner.recognizeEntity('/docs', 'random-notes.md');
    expect(result.type).toBe('reference');
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('analyzes markdown content for diagnostics', () => {
    const goodContent = `---
title: Test
---

# Heading

Some content here is nice and provides enough detail for the system to process correctly and determine that the content is not too short for processing`;
    const diagnostics1 = scanner.analyzeMdContent(goodContent);
    expect(diagnostics1.length).toBe(0);

    const noFrontmatter = `# Heading

Some content here`;
    const diagnostics2 = scanner.analyzeMdContent(noFrontmatter);
    expect(diagnostics2).toContain('Missing YAML frontmatter');

    const noHeadings = `---
title: Test
---

Just some plain text with enough length to pass the minimum character requirement of fifty characters or more for validation purposes`;
    const diagnostics3 = scanner.analyzeMdContent(noHeadings);
    expect(diagnostics3).toContain('No heading structure found');

    const tooShort = `---
title: Test
---

Short`;
    const diagnostics4 = scanner.analyzeMdContent(tooShort);
    expect(diagnostics4).toContain('Content is too short');
  });

  test('builds mapping suggestions from scan results', () => {
    const results: FileScanResult[] = [
      {
        path: 'docs/project-brief.md',
        recognition: {
          type: 'project-brief',
          confidence: 0.9,
          reason: 'Direct match',
        },
        diagnostics: [],
      },
      {
        path: 'docs/world.md',
        recognition: {
          type: 'world-foundation',
          confidence: 0.85,
          reason: 'World-building content',
        },
        diagnostics: [],
      },
      {
        path: 'docs/volume-1.md',
        recognition: {
          type: 'volume',
          confidence: 0.8,
          suggestedMapping: 'volume-1',
          reason: 'Volume pattern',
        },
        diagnostics: [],
      },
      {
        path: 'docs/volume-2.md',
        recognition: {
          type: 'volume',
          confidence: 0.8,
          suggestedMapping: 'volume-2',
          reason: 'Volume pattern',
        },
        diagnostics: [],
      },
      {
        path: 'docs/notes.md',
        recognition: {
          type: 'unknown',
          confidence: 0.2,
          reason: 'No clear type',
        },
        diagnostics: [],
      },
    ];

    const suggestions = scanner.buildMappingSuggestions(results);

    expect(suggestions.projectBriefMapping).toBe('docs/project-brief.md');
    expect(suggestions.worldFoundationMapping).toBe('docs/world.md');
    expect(suggestions.volumeMappings.length).toBe(2);
    expect(suggestions.volumeMappings[0]?.volumeNumber).toBe(1);
    expect(suggestions.volumeMappings[1]?.volumeNumber).toBe(2);
    expect(suggestions.unmappableFiles).toContain('docs/notes.md');
  });

  test('sorts volumes by number in suggestions', () => {
    const results: FileScanResult[] = [
      {
        path: 'vol-3.md',
        recognition: {
          type: 'volume',
          confidence: 0.8,
          suggestedMapping: 'volume-3',
          reason: 'Volume pattern',
        },
        diagnostics: [],
      },
      {
        path: 'vol-1.md',
        recognition: {
          type: 'volume',
          confidence: 0.8,
          suggestedMapping: 'volume-1',
          reason: 'Volume pattern',
        },
        diagnostics: [],
      },
      {
        path: 'vol-2.md',
        recognition: {
          type: 'volume',
          confidence: 0.8,
          suggestedMapping: 'volume-2',
          reason: 'Volume pattern',
        },
        diagnostics: [],
      },
    ];

    const suggestions = scanner.buildMappingSuggestions(results);

    expect(suggestions.volumeMappings[0]?.volumeNumber).toBe(1);
    expect(suggestions.volumeMappings[1]?.volumeNumber).toBe(2);
    expect(suggestions.volumeMappings[2]?.volumeNumber).toBe(3);
  });
});
