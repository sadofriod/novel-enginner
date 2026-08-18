import { describe, expect, test } from 'bun:test';

import type { ModelProvider } from '../agent/provider';
import { seedStageProposal } from './bootstrap-stage-seeding';
import { RuntimeStore } from './store';
import { reSyncState } from '../workspace/sync-engine';

const WORKSPACE_ID = 'workspace-seeding-test';
const BOOK_ID = 'book-seeding-test';

const BRIEF_MARKDOWN = `---
id: project-brief-import
bookId: book-seeding-test
title: 测试作品
genres: [科幻]
targetAudience: 青年读者
marketScope: 中文网络连载市场
readerPromise: 持续紧张感
corePremise: 在规则中追求自由
openingHook: 开场事件
contentBoundaries: []
format: 连载长篇
sourceResearchEvidenceIds: []
assumptionIds: []
status: approved
---

# Brief
`;

const GENERATED_WORLD = `---
id: world-foundation-llm
bookId: book-seeding-test
eraAndPrimarySetting: LLM 生成的星海纪元
realityMode: hard
tone: cold
capabilitySystem: none
immutableRules: []
socialOrder: order
narrativeProhibitions: []
terminologyRefs: []
projectBriefRef: project-brief-import
status: draft
---

# World
`;

const llmProvider: ModelProvider = {
  providerId: 'fake',
  providerVersion: 'test',
  resolveModelId: () => 'fake-model',
  complete: async () => ({ text: GENERATED_WORLD, modelId: 'fake-model', providerVersion: 'test' }),
};

function setup() {
  const store = new RuntimeStore();
  const snapshot = reSyncState([{ path: 'state/book/project-brief.md', content: BRIEF_MARKDOWN }]).snapshot;
  store.setLastKnownSnapshot(WORKSPACE_ID, snapshot);
  const session = {
    id: 'bootstrap-seeding-001',
    workspaceId: WORKSPACE_ID,
    bookId: BOOK_ID,
    path: 'new-book' as const,
    status: 'advancing' as const,
    currentStage: 'world-foundation' as const,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  };
  return { store, session };
}

describe('seedStageProposal (新书播种 LLM)', () => {
  test('uses LLM-generated content when a provider is configured', async () => {
    const { store, session } = setup();
    const seeded = await seedStageProposal({
      store,
      envelope: {
        workspaceId: WORKSPACE_ID,
        bookId: BOOK_ID,
        intent: 'continue-bootstrap-session',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: 'seed-001',
      },
      runId: 'run-seed-001',
      payload: {},
      provideModel: () => llmProvider,
    }, session, 'world-foundation');

    expect(seeded).toBe(true);
    const proposal = store.getActiveProposal('world-foundation', 'world-foundation-llm');
    expect(proposal).toBeDefined();
    expect(proposal?.origin).toBe('generated');
    const draft = store.getCanonicalDraft(proposal?.proposalId ?? '');
    expect(draft?.content).toContain('LLM 生成的星海纪元');
  });

  test('falls back to the template when no provider is configured', async () => {
    const { store, session } = setup();
    const seeded = await seedStageProposal({
      store,
      envelope: {
        workspaceId: WORKSPACE_ID,
        bookId: BOOK_ID,
        intent: 'continue-bootstrap-session',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: 'seed-002',
      },
      runId: 'run-seed-002',
      payload: {},
    }, session, 'world-foundation');

    expect(seeded).toBe(true);
    const proposal = store.getActiveProposal('world-foundation', `world-foundation-${BOOK_ID}`);
    expect(proposal).toBeDefined();
    expect(store.getCanonicalDraft(proposal?.proposalId ?? '')?.content).toContain('围绕');
  });
});
