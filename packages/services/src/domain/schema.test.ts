import { describe, expect, test } from 'bun:test';

import { ProposalSchema, ProjectBriefSchema, StoryBlueprintSchema, WorldFoundationSchema } from './schema';

describe('domain schema contracts', () => {
  test('accepts the bootstrap canonical contracts', () => {
    expect(
      ProjectBriefSchema.parse({
        id: 'project-brief-001',
        bookId: 'book-001',
        title: '测试立项简报',
        genres: ['科幻'],
        targetAudience: '网文读者',
        marketScope: '本地首发',
        readerPromise: '每章都有推进',
        corePremise: '一次错误的修复引发更大的真相',
        openingHook: '火星遗迹中的异常信号',
        contentBoundaries: ['不写无限战力'],
        format: 'serial',
        sourceResearchEvidenceIds: ['evidence-001'],
        assumptionIds: ['assumption-001'],
        status: 'approved',
      }),
    ).toMatchObject({ id: 'project-brief-001' });

    expect(
      WorldFoundationSchema.parse({
        id: 'world-foundation-001',
        bookId: 'book-001',
        eraAndPrimarySetting: '近未来火星基地',
        realityMode: 'hard-sf',
        tone: '克制',
        capabilitySystem: '工程约束驱动',
        immutableRules: ['不能凭空跃迁'],
        socialOrder: '多阵营竞争',
        narrativeProhibitions: ['禁止万能解释'],
        terminologyRefs: ['term-001'],
        projectBriefRef: 'project-brief-001',
        status: 'approved',
      }),
    ).toMatchObject({ projectBriefRef: 'project-brief-001' });

    expect(
      StoryBlueprintSchema.parse({
        id: 'story-blueprint-001',
        bookId: 'book-001',
        projectBriefRef: 'project-brief-001',
        worldFoundationRef: 'world-foundation-001',
        protagonistArc: '从逃离到承担',
        centralConflict: '真相与生存的对抗',
        opposition: '掌控资源的势力',
        resolutionDirection: '用代价换取答案',
        volumePlan: ['volume-001'],
        crossVolumeCommitments: ['隐藏起源最终回收'],
        estimatedVolumeCount: 3,
        status: 'approved',
      }),
    ).toMatchObject({ worldFoundationRef: 'world-foundation-001' });
  });

  test('accepts expanded proposal artifact types', () => {
    expect(
      ProposalSchema.parse({
        proposalId: 'proposal-project-brief-001',
        artifactType: 'project-brief',
        targetId: 'project-brief-001',
        status: 'pending-approval',
        intent: 'propose',
        basedOnCanonicalVersion: 'snap-book-001',
        parentRunId: 'run-001',
      }),
    ).toMatchObject({ artifactType: 'project-brief' });
  });
});
