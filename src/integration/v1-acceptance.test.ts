import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope, Proposal } from '../domain';
import { assembleReviewerResult } from '../agent/reviewer';
import { handleHandEditedArtifact } from '../agent/synthetic-review';
import {
  discoverCapabilitiesFromAllSources,
  parseCapabilityRegistry,
  reconcileCapabilities,
} from '../agent/capability-registry';
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
});
