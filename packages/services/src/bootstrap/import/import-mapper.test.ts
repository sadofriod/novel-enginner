import { describe, test, expect } from 'bun:test';
import { BootstrapImportMapper, type ImportMapping } from './import-mapper';

describe('BootstrapImportMapper', () => {
  const mapper = new BootstrapImportMapper();

  test('creates mapping from scan suggestions', () => {
    const suggestions = {
      projectBriefMapping: 'docs/brief.md',
      worldFoundationMapping: 'docs/world.md',
      storyBlueprintMapping: 'docs/story.md',
      volumeMappings: [
        { volumeNumber: 1, filePath: 'volume-1.md' },
        { volumeNumber: 2, filePath: 'volume-2.md' },
      ],
      unmappableFiles: ['notes.md', 'references.md'],
    };

    const mapping = mapper.createMapping(suggestions);

    expect(mapping.id).toBeDefined();
    expect(mapping.createdAt).toBeDefined();
    expect(mapping.authorApproved).toBe(false);
    expect(mapping.entries.length).toBe(7); // 3 core + 2 volumes + 2 references
  });

  test('counts statistics correctly', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      worldFoundationMapping: 'world.md',
      volumeMappings: [{ volumeNumber: 1, filePath: 'vol-1.md' }],
      unmappableFiles: ['notes.md'],
    };

    const mapping = mapper.createMapping(suggestions);

    expect(mapping.statistics.totalFiles).toBe(4);
    expect(mapping.statistics.mappedCount).toBe(3);
    expect(mapping.statistics.referencesCount).toBe(1);
    expect(mapping.statistics.pendingReviewCount).toBeGreaterThan(0);
  });

  test('updates entry after author review', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      volumeMappings: [{ volumeNumber: 1, filePath: 'vol-1.md' }],
      unmappableFiles: [],
    };

    let mapping = mapper.createMapping(suggestions);

    // Author changes a reference mapping to actual volume
    mapping = mapper.updateEntry(mapping, 'vol-1.md', {
      targetCanonicalKind: 'volume',
      requiresManualReview: false,
    });

    const entry = mapping.entries.find((e) => e.sourceFilePath === 'vol-1.md');
    expect(entry?.targetCanonicalKind).toBe('volume');
    expect(entry?.requiresManualReview).toBe(false);
  });

  test('preserves original source file path when updating', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      volumeMappings: [],
      unmappableFiles: [],
    };

    let mapping = mapper.createMapping(suggestions);
    mapping = mapper.updateEntry(mapping, 'brief.md', {
      targetPath: 'custom/path.md',
    });

    const entry = mapping.entries.find((e) => e.sourceFilePath === 'brief.md');
    expect(entry?.sourceFilePath).toBe('brief.md');
    expect(entry?.targetPath).toBe('custom/path.md');
  });

  test('marks mapping as approved by author', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      volumeMappings: [],
      unmappableFiles: [],
    };

    let mapping = mapper.createMapping(suggestions);
    expect(mapping.authorApproved).toBe(false);
    expect(mapping.approvedAt).toBeUndefined();

    mapping = mapper.approveMapping(mapping);

    expect(mapping.authorApproved).toBe(true);
    expect(mapping.approvedAt).toBeDefined();
  });

  test('validates mapping requires core artifacts', () => {
    const emptyMappings = {
      unmappableFiles: ['notes.md'],
      volumeMappings: [],
    };

    const mapping = mapper.createMapping(emptyMappings);
    const validation = mapper.validateMapping(mapping);

    expect(validation.valid).toBe(false);
    expect(validation.issues[0]).toContain('At least one core artifact');
  });

  test('validates mapping detects unmapped high-confidence entries', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      unmappableFiles: [],
      volumeMappings: [],
    };

    let mapping = mapper.createMapping(suggestions);

    // Manually mark a high-confidence entry as reference
    mapping = mapper.updateEntry(mapping, 'brief.md', {
      targetCanonicalKind: 'reference',
      confidence: 0.85,
    });

    const validation = mapper.validateMapping(mapping);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((i) => i.includes('high-confidence'))).toBe(true);
  });

  test('validates mapping with properly mapped entries', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      worldFoundationMapping: 'world.md',
      volumeMappings: [],
      unmappableFiles: ['notes.md'],
    };

    const mapping = mapper.createMapping(suggestions);
    const validation = mapper.validateMapping(mapping);

    expect(validation.valid).toBe(true);
    expect(validation.issues.length).toBe(0);
  });

  test('sets target paths for standard artifact types', () => {
    const suggestions = {
      projectBriefMapping: 'brief.md',
      worldFoundationMapping: 'world.md',
      storyBlueprintMapping: 'story.md',
      volumeMappings: [{ volumeNumber: 1, filePath: 'vol-1.md' }],
      unmappableFiles: [],
    };

    const mapping = mapper.createMapping(suggestions);

    const projectBrief = mapping.entries.find((e) => e.targetCanonicalKind === 'project-brief');
    expect(projectBrief?.targetPath).toBe('state/book/project-brief.md');

    const worldFound = mapping.entries.find((e) => e.targetCanonicalKind === 'world-foundation');
    expect(worldFound?.targetPath).toBe('state/world/world-foundation.md');

    const storyBP = mapping.entries.find((e) => e.targetCanonicalKind === 'story-blueprint');
    expect(storyBP?.targetPath).toBe('state/book/story-blueprint.md');

    const volume = mapping.entries.find((e) => e.targetCanonicalKind === 'volume');
    expect(volume?.targetPath).toContain('volumes/volume-1');
  });
});
