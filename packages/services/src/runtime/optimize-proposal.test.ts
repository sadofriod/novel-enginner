import { describe, expect, test } from 'bun:test';

import type { ModelProvider } from '../agent/provider';
import { reSyncState } from '../workspace/sync-engine';
import { RunEventBus } from './event-bus';
import { tryApplyOptimizeArtifact } from './optimize-proposal';
import { RuntimeStore } from './store';

const WORKSPACE_ID = 'workspace-optimize-001';
const BOOK_ID = 'book-optimize-001';

const VALID_CHAPTER_OUTLINE_MARKDOWN = `---
id: chapter-0001-outline
chapterNumber: 1
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: draft
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0001-entry
    purpose: Enter the harbor
    locationId: location-harbor
    participantCharacterIds: [char-mira]
emotionCurveStageIds: [emotion-0001-1, emotion-0001-2, emotion-0001-3, emotion-0001-4]
---

# Outline

The chapter opens at the harbor.
`;

function fakeProvider(text: string, fail = false): ModelProvider {
  return {
    providerId: 'fake',
    providerVersion: 'test',
    resolveModelId: () => 'fake-model',
    complete: async () => {
      if (fail) {
        throw new Error('OpenAI provider requires an apiKey');
      }
      return { text, modelId: 'fake-model', providerVersion: 'test' };
    },
  };
}

function setup() {
  const store = new RuntimeStore();
  store.setLastKnownSnapshot(WORKSPACE_ID, reSyncState([]).snapshot);
  return { store, eventBus: new RunEventBus() };
}

describe('tryApplyOptimizeArtifact', () => {
  test('creates a pending-approval generated proposal with the optimized draft', async () => {
    const { store, eventBus } = setup();
    const result = await tryApplyOptimizeArtifact({
      store,
      eventBus,
      runId: 'run-optimize-001',
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      provider: fakeProvider(VALID_CHAPTER_OUTLINE_MARKDOWN),
      options: {
        readCanonicalFiles: async () => [{ path: 'state/chapters/chapter-0001-outline.md', content: '# old\n' }],
      },
    });

    expect(result?.proposalId).toBe('proposal-run-optimize-001');
    const proposal = store.getProposal('proposal-run-optimize-001');
    expect(proposal).toMatchObject({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      status: 'pending-approval',
      intent: 'optimize',
      origin: 'generated',
    });
    const draft = store.getCanonicalDraft('proposal-run-optimize-001');
    expect(draft?.relativePath).toBe('state/chapters/chapter-0001-outline.md');
    expect(result?.events.some((event) => event.type === 'proposal.optimized')).toBe(true);
  });

  test('fails loudly when the provider cannot complete (no model configured)', async () => {
    const { store, eventBus } = setup();
    const result = await tryApplyOptimizeArtifact({
      store,
      eventBus,
      runId: 'run-optimize-002',
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      provider: fakeProvider('', true),
      options: {},
    });

    expect(result).toBeUndefined();
    expect(store.getProposal('proposal-run-optimize-002')).toBeUndefined();
    expect(eventBus.history('run-optimize-002').some((event) => event.type === 'run.step.failed')).toBe(true);
  });

  test('rejects artifact types that cannot be optimized as a single-file proposal', async () => {
    const { store, eventBus } = setup();
    const result = await tryApplyOptimizeArtifact({
      store,
      eventBus,
      runId: 'run-optimize-003',
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      artifactType: 'character-update',
      targetId: 'char-mira',
      provider: fakeProvider(''),
      options: {},
    });

    expect(result).toBeUndefined();
    expect(store.getProposal('proposal-run-optimize-003')).toBeUndefined();
    expect(eventBus.history('run-optimize-003').some((event) => event.type === 'run.step.failed')).toBe(true);
  });
});
