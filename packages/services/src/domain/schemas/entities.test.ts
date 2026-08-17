import { describe, expect, test } from 'bun:test';

import { CharacterSchema, FactSchema, FactionSchema, PlotClueSchema } from './entities';

describe('world entity schemas', () => {
  test('FactSchema requires stable id, statement, source, and status', () => {
    expect(
      FactSchema.parse({
        id: 'fact-1',
        statement: '二极管来自旧灯塔',
        sourceRef: 'scene-1',
        visibility: 'actor-known',
        status: 'active',
      }),
    ).toMatchObject({ id: 'fact-1' });
    expect(
      FactSchema.safeParse({ id: 'fact-1', statement: '', sourceRef: 's', visibility: 'v', status: 'active' }).success,
    ).toBe(false);
  });

  test('CharacterSchema accepts a knowledgeLedger of belief records', () => {
    const character = CharacterSchema.parse({
      id: 'char-1',
      name: '林默',
      status: 'active',
      coreMotivation: '求生存',
      worldview: 'pragmatic',
      techLevel: 'tier-3',
      knowledgeLedger: [
        {
          factId: 'fact-1',
          beliefState: 'known',
          sourceRef: 'scene-1',
          chapterAcquired: 41,
          visibility: 'actor-known',
          confidence: 0.9,
        },
      ],
    });

    expect(character.knowledgeLedger).toHaveLength(1);
    expect(character.knowledgeLedger?.[0]?.beliefState).toBe('known');
  });

  test('FactionSchema requires goal, type, and knownByCharacters', () => {
    expect(
      FactionSchema.parse({
        id: 'faction-1',
        name: '中继辛迪加',
        type: 'paramilitary',
        goal: '垄断维护权',
        resourceIds: [],
        relationshipIds: [],
        knownByCharacters: ['char-1'],
        status: 'active',
      }),
    ).toMatchObject({ name: '中继辛迪加' });
  });

  test('PlotClueSchema requires resolveTargetVolume and clue relation lists', () => {
    expect(
      PlotClueSchema.parse({
        id: 'clue-1',
        title: '二极管起源',
        introducedInChapter: 41,
        currentStatus: 'active',
        resolveTargetVolume: 'volume-1',
        readerVisibility: 'reader-known',
        knownByCharacterIds: ['char-1'],
        misledCharacterIds: [],
        dependencyClueIds: [],
        conflictClueIds: [],
      }),
    ).toMatchObject({ title: '二极管起源' });
  });
});
