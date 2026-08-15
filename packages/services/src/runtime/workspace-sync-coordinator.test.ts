import { describe, expect, test } from 'bun:test';

import { RunEventBus } from './event-bus';
import { coordinateWorkspaceSync } from './workspace-sync-coordinator';
import { RuntimeStore } from './store';
import { WorkspaceSyncSession } from '../workspace/session';

const CHAPTER_OUTLINE = `---
id: chapter-0042-outline
chapterNumber: 42
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: approved
displayTitle: 进入遗迹
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0042-entry
    purpose: Enter the ruined laboratory
    locationId: location-ruined-lab
    participantCharacterIds: [char-lin-mo]
emotionCurveStageIds: [emotion-1, emotion-2, emotion-3, emotion-4]
---
`;

const CHAPTER_MANUSCRIPT = `---
id: chapter-0042
chapterNumber: 42
volumeId: volume-001
basedOnOutlineId: chapter-0042-outline
status: approved
displayTitle: 进入遗迹
basedOnCanonicalVersion: snap-0001
sceneAnchorIds: [scene-0042-entry]
---

# Scene scene-0042-entry

Lin Mo enters the ruined laboratory.
`;

const VALID_WORKSPACE_FILES = [
  {
    path: 'state/characters/char-lin-mo.md',
    content: `---
id: char-lin-mo
name: Lin Mo
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---
`,
  },
  {
    path: 'state/locations/location-ruined-lab.md',
    content: `---
id: location-ruined-lab
name: Ruined Lab
status: active
type: ruins
hazards: []
accessRules: []
---
`,
  },
  {
    path: 'state/volumes/volume-001.md',
    content: `---
id: volume-001
title: Test Volume
status: active
sequenceNumber: 1
goal: Test goal
stage: escalation
chapterRoster: [chapter-0042-outline]
targetChapterCount: 1
requiredCluePayoffs: []
milestones: []
---
`,
  },
  { path: 'state/chapters/chapter-0042-outline.md', content: CHAPTER_OUTLINE },
  { path: 'manuscript/volume-001/chapter-0042.md', content: CHAPTER_MANUSCRIPT },
] as const;

describe('coordinateWorkspaceSync', () => {
  test('converges a valid canonical save to clean after rebuilding derived state', async () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    const session = new WorkspaceSyncSession();
    const files = VALID_WORKSPACE_FILES;
    const state = session.applySave(files);
    expect(state.errors).toEqual([]);
    store.upsertArtifact({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
    });

    await coordinateWorkspaceSync({
      store,
      eventBus,
      workspaceId: 'workspace-test',
      bookId: 'book-test',
      session,
      state,
      files,
    });

    expect(store.getWorkspaceValidity('workspace-test')).toBe('clean');
    expect(store.getLastKnownSnapshot('workspace-test')?.snapshotId).toBe(state.snapshot.snapshotId);
    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')?.derivedGraph?.status).toBe('ready');
    expect(eventBus.history(`sync-${state.snapshot.snapshotId}`).map((event) => event.type)).toEqual([
      'workspace.valid',
      'derived.ready',
    ]);
  });

  test('marks approved protected canonical edits review-stale and dispatches a synthetic review', async () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    const session = new WorkspaceSyncSession();
    const files = VALID_WORKSPACE_FILES;
    const state = session.applySave(files);
    expect(state.errors).toEqual([]);
    store.upsertArtifact({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      proposalStatus: 'approved',
    });
    store.upsertArtifact({
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0042',
      proposalStatus: 'override-approved',
    });
    const dispatched: string[] = [];

    await coordinateWorkspaceSync({
      store,
      eventBus,
      workspaceId: 'workspace-test',
      bookId: 'book-test',
      session,
      state,
      files,
      dispatchSyntheticReview: async (input) => {
        dispatched.push(`${input.artifactType}:${input.targetId}`);
      },
    });

    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')?.reviewStale).toBe(true);
    expect(store.getArtifact('chapter-manuscript', 'chapter-0042')?.reviewStale).toBe(true);
    expect(dispatched).toEqual(['chapter-outline:chapter-0042-outline', 'chapter-manuscript:chapter-0042']);
    expect(eventBus.history(`sync-${state.snapshot.snapshotId}`).filter((event) => event.type === 'artifact.review-stale')).toHaveLength(2);
  });

  test('aborts active write runs when a canonical save advances the snapshot', async () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    const session = new WorkspaceSyncSession();
    const files = VALID_WORKSPACE_FILES;
    const state = session.applySave(files);
    expect(state.errors).toEqual([]);
    store.saveRun({
      runId: 'run-stale-write',
      commandId: 'cmd-stale-write',
      workspaceId: 'workspace-test',
      bookId: 'book-test',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      intent: 'propose',
      basedOnCanonicalVersion: 'snap-0000',
      status: 'running',
      nextExpectedState: 'proposal-pending',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });

    await coordinateWorkspaceSync({
      store,
      eventBus,
      workspaceId: 'workspace-test',
      bookId: 'book-test',
      session,
      state,
      files,
      getActiveRuns: () => store.listActiveWriteRuns(),
    });

    expect(store.getRun('run-stale-write')?.status).toBe('aborted');
    expect(eventBus.history('run-stale-write').map((event) => event.type)).toEqual(['run.aborted']);
  });
});