import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope, Proposal } from '../domain';
import { assembleReviewerResult, isNonExemptibleReviewFailure } from '../agent/reviewer';
import { handleHandEditedArtifact } from '../agent/synthetic-review';
import { discoverCapabilitiesFromAllSources } from '../agent/capabilities/discovery';
import { parseCapabilityRegistry } from '../agent/capabilities/registry-parse';
import { reconcileCapabilities } from '../agent/capabilities/reconcile';
import { RuntimeStore } from '../runtime/store';
import { applySyntheticReviewOutcome, isDownstreamAutoFlowBlocked } from '../runtime/synthetic-review-gate';
import { buildDerivedGraph } from '../graph/derive/build';
import { applyProposalCommand } from '../workflow/command-lifecycle';
import { abortDriftedRuns } from '../workflow/run-drift';
import { buildProposalRegistry, createProposal } from '../workflow/proposal-lifecycle';
import { guardCommandAgainstWorkspaceValidity } from '../workspace/guard';
import { reSyncState } from '../workspace/sync-engine';

const VALID_CHARACTER = `---
id: char-integration
name: Integration Character
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---

# Summary

A stable canonical character.
`;

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-integration-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    status: 'pending-approval',
    intent: 'propose',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-integration-001',
    ...overrides,
  };
}

function decisionCommand(intent: CommandEnvelope['intent']): CommandEnvelope {
  return {
    workspaceId: 'workspace-integration',
    bookId: 'book-integration',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    intent,
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `integration-${intent}`,
  };
}

describe('V1 acceptance matrix', () => {
  test('invalid canonical input preserves the last valid snapshot and blocks propose', () => {
    const good = reSyncState([{ path: 'state/characters/char-integration.md', content: VALID_CHARACTER }]);
    const broken = reSyncState(
      [{ path: 'state/characters/char-integration.md', content: VALID_CHARACTER.replace('status: active', 'status: broken') }],
      good.snapshot,
    );

    expect(broken.validity).toBe('invalid');
    expect(broken.snapshot.entities.get('state/characters/char-integration.md')?.data)
      .toEqual(good.snapshot.entities.get('state/characters/char-integration.md')?.data);
    expect(guardCommandAgainstWorkspaceValidity('propose', broken.validity).blocked).toBe(true);
  });

  test('same target proposal supersedes the previous active proposal', () => {
    const first = proposal();
    const result = createProposal({
      proposal: proposal({ proposalId: 'proposal-integration-002', basedOnCanonicalVersion: 'snap-0002' }),
      registry: buildProposalRegistry([first]),
    });

    expect(result.superseded?.status).toBe('superseded');
    expect(result.created.supersedesProposalId).toBe(first.proposalId);
  });

  test('snapshot drift aborts only write-related running runs', () => {
    const aborted = abortDriftedRuns(
      [
        { runId: 'run-write', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: true },
        { runId: 'run-read', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: false },
      ],
      'snap-0002',
    );

    expect(aborted.map((decision) => decision.run.runId)).toEqual(['run-write']);
    expect(aborted[0]?.driftReason).toContain('aborting');
  });

  test('approved proposal becomes commit-blocked or waiting-sync before canonical write', () => {
    const invalid = applyProposalCommand({
      envelope: decisionCommand('approve'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'invalid',
    });
    const dirty = applyProposalCommand({
      envelope: decisionCommand('approve'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'dirty',
    });

    expect(invalid.accepted && invalid.proposal.status).toBe('commit-blocked');
    expect(dirty.accepted && dirty.proposal.status).toBe('waiting-sync');
  });

  test('manual edit dispatches synthetic review and reviewer output remains structured', async () => {
    const events: string[] = [];
    const freshness = await handleHandEditedArtifact(
      {
        workspaceId: 'workspace-integration',
        bookId: 'book-integration',
        artifactType: 'chapter-manuscript',
        targetId: 'chapter-0001',
        filePath: 'manuscript/volume-001/chapter-0001.md',
        wasApprovedBeforeEdit: true,
        editedText: 'A manually edited paragraph that needs a fresh review.',
      },
      async (event) => {
        events.push(event.name);
      },
    );
    const review = assembleReviewerResult('A stable paragraph with enough text to satisfy the deterministic reviewer length rule.', {
      hardFailures: [],
      dimensionScores: {
        antiAiVoice: 90,
        webFictionPacing: 90,
        emotionCurve: 90,
        characterConsistency: 90,
        settingConsistency: 90,
        clueCausality: 90,
        readabilityLayout: 90,
        languageTexture: 90,
      },
      rewriteDirectives: [],
    });

    expect(freshness.stale).toBe(true);
    expect(events).toEqual(['novel/review.synthetic-requested']);
    expect(review.approved).toBe(true);
  });

  test('missing registered capability blocks dependent assembly while unregistered discovery is non-blocking', () => {
    const registered = parseCapabilityRegistry(`---\ncapabilities:\n  - id: required-skill\n    type: skill\n    enabled: true\n    allowedAgents: [drafter]\n---`);
    const discovered = discoverCapabilitiesFromAllSources({ skillFiles: ['skills/other-skill/SKILL.md'] });
    const result = reconcileCapabilities(registered, discovered);

    expect(result.blockingCapabilityIds).toEqual(['required-skill']);
    expect(result.snapshots[0]?.status).toBe('missing-source');
    expect(result.snapshots[1]?.status).toBe('discovered-unregistered');
  });

  test('fixing an invalid file restores validity, lifts the block, and rebuilds derived state (acceptance #2)', () => {
    const good = reSyncState([{ path: 'state/characters/char-integration.md', content: VALID_CHARACTER }]);
    const broken = reSyncState(
      [{ path: 'state/characters/char-integration.md', content: VALID_CHARACTER.replace('status: active', 'status: broken') }],
      good.snapshot,
    );

    expect(broken.validity).toBe('invalid');
    expect(guardCommandAgainstWorkspaceValidity('propose', broken.validity).blocked).toBe(true);

    // Restoring the valid content brings the workspace back to clean and lifts the block.
    const fixed = reSyncState([{ path: 'state/characters/char-integration.md', content: VALID_CHARACTER }], broken.snapshot);
    expect(fixed.validity).toBe('clean');
    expect(guardCommandAgainstWorkspaceValidity('propose', fixed.validity).blocked).toBe(false);
    const graph = buildDerivedGraph(fixed.snapshot);
    expect(graph.nodes.some((node) => node.id === 'char-integration' && node.kind === 'Character')).toBe(true);
  });

  test('an active chapter-manuscript run is aborted on a new snapshot and never auto-restarted (acceptance #4)', () => {
    const aborted = abortDriftedRuns(
      [{ runId: 'run-manuscript-0042', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: true }],
      'snap-0002',
    );

    expect(aborted).toHaveLength(1);
    expect(aborted[0]?.run.status).toBe('aborted');
    expect(aborted[0]?.driftReason).toContain('aborting instead of rebasing');
    // No auto-restart: the aborted run is final, and no replacement run is spawned.
    expect(aborted.some((decision) => decision.run.status === 'running')).toBe(false);
    // A fresh run against the new canonical version is what resumes work.
    expect(abortDriftedRuns(
      [{ runId: 'run-manuscript-0042-fresh', status: 'running', basedOnCanonicalVersion: 'snap-0002', isWriteRelated: true }],
      'snap-0002',
    )).toHaveLength(0);
  });

  test('blocked synthetic review keeps canonical and blocks downstream auto flow (acceptance #7)', () => {
    const store = new RuntimeStore();
    const handEdited = `---
id: chapter-0042
volumeId: volume-001
status: draft
---

# Chapter 42

A hand-edited paragraph that stays long enough for the deterministic length rule while carrying a semantic non-exemptible defect flagged by the synthetic review.
`;
    const initial = reSyncState([{ path: 'manuscript/volume-001/chapter-0042.md', content: handEdited }]);
    store.setLastKnownSnapshot('workspace-integration', initial.snapshot);
    store.upsertArtifact({
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0042',
      canonicalStatus: 'approved',
      proposalStatus: 'approved',
      reviewStale: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // The async synthetic review finds a non-exemptible (non-overridable) failure.
    const review = assembleReviewerResult(
      handEdited,
      { hardFailures: [{ code: 'clue-payoff-conflict', message: 'Clue never pays off.' }], dimensionScores: { antiAiVoice: 90, webFictionPacing: 90, emotionCurve: 60, characterConsistency: 90, settingConsistency: 90, clueCausality: 90, readabilityLayout: 90, languageTexture: 90 }, rewriteDirectives: [] },
    );
    expect(isNonExemptibleReviewFailure(review)).toBe(true);

    applySyntheticReviewOutcome(store, 'chapter-manuscript', 'chapter-0042', { status: 'blocked', reviewerResult: review });

    // Canonical is NOT rolled back: the hand-edited entity still lives in the snapshot.
    const snapshot = store.getLastKnownSnapshot('workspace-integration');
    expect(snapshot?.entities.get('manuscript/volume-001/chapter-0042.md')?.data).toEqual(
      initial.snapshot.entities.get('manuscript/volume-001/chapter-0042.md')?.data,
    );
    // Downstream auto flows depending on the artifact are blocked.
    expect(isDownstreamAutoFlowBlocked(store, 'chapter-manuscript', 'chapter-0042')).toBe(true);
    // Re-review passing clears the block so downstream work may resume.
    applySyntheticReviewOutcome(store, 'chapter-manuscript', 'chapter-0042', { status: 'passed' });
    expect(isDownstreamAutoFlowBlocked(store, 'chapter-manuscript', 'chapter-0042')).toBe(false);
  });

  test('knowledgeLedger, displayTitle, PlanningAnchor, and scene anchors are parsed, persisted, and surfaced in the API summary (acceptance #10)', () => {
    const files = [
      {
        path: 'state/volumes/volume-001.md',
        content: `---\nid: volume-001\ntitle: 第一卷\nstatus: active\nsequenceNumber: 1\ngoal: 完成首卷主线\nstage: planning\nchapterRoster:\n  - chapter-0041-outline\ntargetChapterCount: 1\nrequiredCluePayoffs: []\nmilestones: []\n---\n`,
      },
      {
        path: 'state/locations/location-harbor.md',
        content: `---\nid: location-harbor\nname: 海港\ntype: city\nhazards: []\naccessRules: []\nstatus: active\n---\n`,
      },
      {
        path: 'state/facts/fact-diode-origin.md',
        content: `---\nid: fact-diode-origin\nstatement: 二极管来自旧灯塔\nsourceRef: scene-0041-terminal-breach\nvisibility: actor-known\nstatus: active\n---\n`,
      },
      {
        path: 'state/characters/char-lin-mo.md',
        content: `---\nid: char-lin-mo\nname: 林默\nstatus: active\ncoreMotivation: 逃离引力阱\nworldview: engineering-pragmatist\ntechLevel: tier-3\nknowledgeLedger:\n  - factId: fact-diode-origin\n    beliefState: known\n    sourceRef: scene-0041-terminal-breach\n    chapterAcquired: 41\n    visibility: actor-known\n    confidence: 0.92\n---\n\n# Summary\n\n技术驱动型求生者。\n`,
      },
      {
        path: 'state/chapters/chapter-0041-outline.md',
        content: `---\nid: chapter-0041-outline\nchapterNumber: 41\nvolumeId: volume-001\nchapterType: progress\nchapterTypeTags:\n  - progress\nstatus: draft\ndisplayTitle: 潮汐灯塔\ntargetWordCount: 4000\nactiveClueIds: []\nresolveClueIds: []\nintroduceClueIds: []\nsceneSkeleton:\n  - id: scene-0041-terminal-breach\n    purpose: 突破终端防御\n    locationId: location-harbor\n    participantCharacterIds:\n      - char-lin-mo\nemotionCurveStageIds:\n  - emotion-rise-1\n  - emotion-pressure-1\n  - emotion-counter-1\n  - emotion-hook-1\n---\n`,
      },
      {
        path: 'state/planning-anchors/pa-first-tide.md',
        content: `---\nid: pa-first-tide\nkind: milestone\ntitle: 初潮\nstatus: active\nownerRef: volume-001\nsummary: 第一次潮汐锁定的里程碑\nrelatedClueIds: []\ntargetChapterIds: []\n---\n`,
      },
    ];
    const reSync = reSyncState(files);

    expect(reSync.errors).toEqual([]);
    expect(reSync.snapshot.entities.size).toBe(6);
    expect(reSync.snapshot.entities.get('state/characters/char-lin-mo.md')).toBeDefined();
    expect(reSync.snapshot.entities.get('state/chapters/chapter-0041-outline.md')).toBeDefined();
    expect(reSync.snapshot.entities.get('state/planning-anchors/pa-first-tide.md')).toBeDefined();

    const summary = buildDerivedGraph(reSync.snapshot);
    expect(summary.nodes.find((node) => node.id === 'char-lin-mo')?.kind).toBe('Character');
    expect(summary.edges.some((edge) => edge.type === 'knows' && edge.sourceId === 'char-lin-mo' && edge.targetId === 'fact-diode-origin')).toBe(true);
    expect(summary.nodes.find((node) => node.id === 'chapter-0041-outline')?.label).toBe('潮汐灯塔');
    expect(summary.nodes.find((node) => node.id === 'scene-0041-terminal-breach')?.kind).toBe('Scene');
    expect(summary.searchDocuments.some((doc) => doc.kind === 'PlanningAnchor' && doc.nodeId === 'pa-first-tide')).toBe(true);
  });
});
