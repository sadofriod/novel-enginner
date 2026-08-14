import { describe, expect, test } from 'bun:test';

import { ProjectBriefSchema, StoryBlueprintSchema, WorldFoundationSchema, validateProjectBrief, validateStoryBlueprint, validateWorldFoundation } from './canonical-artifacts';

describe('bootstrap canonical artifacts', () => {
  test('accepts valid project brief data', () => {
    const valid = validateProjectBrief({
      id: 'project-brief-1',
      bookId: 'book-1',
      title: 'Nova Run',
      genres: ['science fiction'],
      targetAudience: 'young adults',
      marketScope: 'serial web fiction',
      readerPromise: 'high tension and emotional payoff',
      corePremise: 'a memory-lost engineer returns',
      openingHook: 'the city begins to forget the sun',
      contentBoundaries: ['no explicit gore'],
      format: 'serial',
      sourceResearchEvidenceIds: ['evidence-1'],
      assumptionIds: ['assumption-1'],
      status: 'draft',
    });
    expect(ProjectBriefSchema.safeParse(valid).success).toBe(true);
  });

  test('accepts world foundation and story blueprint', () => {
    const world = validateWorldFoundation({
      id: 'world-1',
      bookId: 'book-1',
      eraAndPrimarySetting: 'far future starport',
      realityMode: 'hard-science',
      tone: 'tense',
      capabilitySystem: 'immersive force lattice',
      immutableRules: ['gravity cannot be broken'],
      socialOrder: 'caste-based port oligarchy',
      narrativeProhibitions: ['no deus ex machina'],
      terminologyRefs: ['term-1'],
      projectBriefRef: 'project-brief-1',
      status: 'draft',
    });
    const blueprint = validateStoryBlueprint({
      id: 'story-blueprint-1',
      bookId: 'book-1',
      projectBriefRef: 'project-brief-1',
      worldFoundationRef: 'world-1',
      protagonistArc: 'falls into the system, claims agency',
      centralConflict: 'a city and its memory engine',
      opposition: 'the port oligarchy',
      resolutionDirection: 'liberation through truth',
      volumePlan: ['first break'],
      crossVolumeCommitments: ['memory theft matters'],
      estimatedVolumeCount: 6,
      status: 'draft',
    });
    expect(world.projectBriefRef).toBe('project-brief-1');
    expect(blueprint.estimatedVolumeCount).toBe(6);
    expect(StoryBlueprintSchema.safeParse(blueprint).success).toBe(true);
  });
});
