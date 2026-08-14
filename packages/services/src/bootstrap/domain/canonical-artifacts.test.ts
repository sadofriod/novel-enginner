import { describe, test, expect } from 'bun:test';
import {
  ProjectBriefSchema,
  WorldFoundationSchema,
  StoryBlueprintSchema,
  validateProjectBrief,
  validateWorldFoundation,
  validateStoryBlueprint,
} from './canonical-artifacts';

describe('Canonical Artifacts Schemas', () => {
  test('validates project-brief with required fields', () => {
    const brief = {
      id: 'pb-1',
      bookId: 'book-1',
      title: 'The Great Adventure',
      genres: ['Fantasy', 'Adventure'],
      targetAudience: 'Young adults 16+',
      marketScope: 'Global English-speaking readers',
      readerPromise: 'Epic quest with personal growth',
      corePremise: 'A chosen one discovers hidden magic',
      openingHook: 'Attack on village triggers discovery',
      contentBoundaries: 'PG-13 violence, no explicit content',
      format: 'Novel',
      sourceResearchEvidenceIds: ['ev-1', 'ev-2'],
      status: 'draft' as const,
    };

    expect(() => validateProjectBrief(brief)).not.toThrow();
  });

  test('rejects project-brief with missing required fields', () => {
    const incomplete = {
      id: 'pb-1',
      bookId: 'book-1',
      title: 'The Great Adventure',
      // missing genres and other required fields
    };

    expect(() => validateProjectBrief(incomplete)).toThrow();
  });

  test('validates world-foundation with required fields', () => {
    const world = {
      id: 'wf-1',
      bookId: 'book-1',
      eraAndPrimarySetting: 'Medieval fantasy, European-inspired kingdom',
      realityMode: 'fantastical' as const,
      tone: 'Epic and mysterious',
      immutableRules: ['Magic is rare and dangerous', 'The prophecy is true'],
      projectBriefRef: 'pb-1',
      status: 'draft' as const,
    };

    expect(() => validateWorldFoundation(world)).not.toThrow();
  });

  test('validates world-foundation with optional fields', () => {
    const worldComplete = {
      id: 'wf-1',
      bookId: 'book-1',
      eraAndPrimarySetting: 'Medieval fantasy, European-inspired kingdom',
      realityMode: 'fantastical' as const,
      tone: 'Epic and mysterious',
      capabilitySystem: 'Mages can cast spells with three sources of power',
      immutableRules: ['Magic is rare and dangerous', 'The prophecy is true'],
      socialOrder: 'Feudal system with noble families controlling regions',
      narrativeProhibitions: ['No time travel', 'No deus ex machina endings'],
      terminologyRefs: ['aether', 'mageborn', 'curse-marks'],
      projectBriefRef: 'pb-1',
      status: 'draft' as const,
    };

    expect(() => validateWorldFoundation(worldComplete)).not.toThrow();
  });

  test('validates story-blueprint with required fields', () => {
    const blueprint = {
      id: 'sb-1',
      bookId: 'book-1',
      projectBriefRef: 'pb-1',
      worldFoundationRef: 'wf-1',
      protagonistArc: 'From slave to liberator',
      centralConflict: 'Overthrowing tyrannical rule',
      opposition: 'The immortal tyrant and their army',
      resolutionDirection: 'Protagonist must choose sacrifice or power',
      estimatedVolumeCount: 3,
      status: 'draft' as const,
    };

    expect(() => validateStoryBlueprint(blueprint)).not.toThrow();
  });

  test('rejects story-blueprint with invalid volume count', () => {
    const invalid = {
      id: 'sb-1',
      bookId: 'book-1',
      projectBriefRef: 'pb-1',
      worldFoundationRef: 'wf-1',
      protagonistArc: 'From slave to liberator',
      centralConflict: 'Overthrowing tyrannical rule',
      opposition: 'The immortal tyrant',
      resolutionDirection: 'Sacrifice or power',
      estimatedVolumeCount: 0, // Invalid: must be positive
      status: 'draft' as const,
    };

    expect(() => validateStoryBlueprint(invalid)).toThrow();
  });

  test('project-brief schema accepts extensions', () => {
    const brief = {
      id: 'pb-1',
      bookId: 'book-1',
      title: 'The Great Adventure',
      genres: ['Fantasy'],
      targetAudience: 'Young adults',
      marketScope: 'Global',
      readerPromise: 'Epic quest',
      corePremise: 'Magic discovery',
      openingHook: 'Attack on village',
      contentBoundaries: 'PG-13',
      format: 'Novel',
      sourceResearchEvidenceIds: [],
      status: 'draft' as const,
      extensions: {
        customField: 'custom value',
        metadata: { author: 'Anonymous' },
      },
    };

    expect(() => validateProjectBrief(brief)).not.toThrow();
  });

  test('world-foundation supports different reality modes', () => {
    const modes = ['realistic', 'fantastical', 'magical', 'sci-fi'] as const;

    for (const mode of modes) {
      const world = {
        id: `wf-${mode}`,
        bookId: 'book-1',
        eraAndPrimarySetting: 'Test setting',
        realityMode: mode,
        tone: 'Test tone',
        immutableRules: ['Rule 1'],
        projectBriefRef: 'pb-1',
        status: 'draft' as const,
      };

      expect(() => validateWorldFoundation(world)).not.toThrow();
    }
  });
});
