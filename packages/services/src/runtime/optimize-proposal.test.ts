import { describe, expect, test } from 'bun:test';

import type { ModelProvider } from '../agent/provider';
import { reSyncState } from '../workspace/sync-engine';
import { RunEventBus } from './event-bus';
import { buildOptimizeInstructions, tryApplyOptimizeArtifact } from './optimize-proposal';
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

const VALID_MANUSCRIPT_SHELL = `---
id: chapter-0001
chapterNumber: 1
volumeId: volume-001
basedOnOutlineId: chapter-0001-outline
status: draft
displayTitle: 修复师的日常
basedOnCanonicalVersion: snap-0001
sceneAnchorIds:
  - scene-chapter-0001-source
---

# Scene scene-chapter-0001-source

原始正文段落。
`;

const LLM_PLAIN_PROSE = '凯走进旧货市场，手指划过废弃的生物电极组件。空气中弥漫着金属锈蚀的气味。\n\n"这根校准线还能用？"凯拿起线缆问道。';

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

describe('buildOptimizeInstructions', () => {
  test('demands a substantive rewrite with AI-flavor filler removal', () => {
    const instructions = buildOptimizeInstructions('chapter-0001', 'chapter-manuscript');
    expect(instructions).toContain('SUBSTANTIVE revision');
    expect(instructions).toContain('canonical identity');
    // Banned terms / density thresholds are NOT re-encoded here; they come from
    // rules.json (system-hard-rules) and anti-ai-voice.prompt.md (project-policy).
    expect(instructions).toContain('system-hard-rules');
    expect(instructions).toContain('project-policy');
    expect(instructions).not.toContain('仿佛');
  });

  test('forbids padding the diff with action/scene description instead of demanding a large diff', () => {
    const instructions = buildOptimizeInstructions('chapter-0001', 'chapter-manuscript');
    expect(instructions).toContain('禁止');
    expect(instructions).toContain('注水');
    expect(instructions).toContain('动作/场景');
    expect(instructions).not.toContain('large and clearly visible');
  });

  test('includes the outline structural-field restraint for outline optimization', () => {
    const instructions = buildOptimizeInstructions('chapter-0001-outline', 'chapter-outline');
    expect(instructions).toContain('purpose');
    expect(instructions).toContain('summary');
    expect(instructions).toContain('简洁概括');
    expect(instructions).toContain('system-hard-rules');
  });
});

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

  test('creates a manuscript proposal when the model returns plain prose', async () => {
    const { store, eventBus } = setup();
    const result = await tryApplyOptimizeArtifact({
      store,
      eventBus,
      runId: 'run-optimize-004',
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0001',
      provider: fakeProvider(LLM_PLAIN_PROSE),
      options: {
        readCanonicalFiles: async () => [{ path: 'manuscript/volume-001/chapter-0001.md', content: VALID_MANUSCRIPT_SHELL }],
      },
    });

    expect(result?.proposalId).toBe('proposal-run-optimize-004');
    const draft = store.getCanonicalDraft('proposal-run-optimize-004');
    expect(draft?.relativePath).toBe('manuscript/volume-001/chapter-0001.md');
    expect(draft?.content).toContain(LLM_PLAIN_PROSE);
    expect(draft?.content).toContain('id: chapter-0001');
    const artifact = store.getArtifact('chapter-manuscript', 'chapter-0001');
    expect(artifact?.activeProposalId).toBe('proposal-run-optimize-004');
    expect(artifact?.proposalStatus).toBe('pending-approval');
    expect(artifact?.proposalDetail?.basedOnCanonicalVersion).toBe('snap-0001');
    expect(artifact?.proposalDetail?.diffs.some((diff) => diff.field === 'content' && diff.changed)).toBe(true);
    expect(result?.events.some((event) => event.type === 'proposal.optimized')).toBe(true);
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
