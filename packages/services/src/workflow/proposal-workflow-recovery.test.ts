import { describe, expect, test } from 'bun:test';

import type { Proposal } from '../domain/schema';

import {
  abortDriftedRuns,
  attemptCanonicalCommit,
  buildProposalRegistry,
  chapterOutlineWorkflow,
  evaluateRunAgainstSnapshotDrift,
  requeueAfterWorkspaceRecovery,
  resolveArtifactWorkflow,
} from './index';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-chapter-0042-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0042-outline',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'author',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-chapter-0042-001',
    ...overrides,
  };
}

describe('commit-blocked / waiting-sync and recovery', () => {
  test('an approved proposal commits when the workspace is clean', () => {
    const proposal = makeProposal({ status: 'approved' });
    const result = attemptCanonicalCommit(proposal, 'clean');
    expect(result.canCommit).toBe(true);
    expect(result.proposal.status).toBe('approved');
  });

  test('an approved proposal is blocked with commit-blocked when the workspace is invalid', () => {
    const proposal = makeProposal({ status: 'approved' });
    const result = attemptCanonicalCommit(proposal, 'invalid');
    expect(result.canCommit).toBe(false);
    expect(result.proposal.status).toBe('commit-blocked');
  });

  test('an approved proposal is blocked with waiting-sync when the workspace is dirty', () => {
    const proposal = makeProposal({ status: 'approved' });
    const result = attemptCanonicalCommit(proposal, 'dirty');
    expect(result.canCommit).toBe(false);
    expect(result.proposal.status).toBe('waiting-sync');
  });

  test('a commit-blocked proposal re-enters the approved queue once the workspace is clean again', () => {
    const blocked = makeProposal({ status: 'commit-blocked' });
    const recovered = requeueAfterWorkspaceRecovery(blocked, 'clean');
    expect(recovered.status).toBe('approved');
  });

  test('an override-approved proposal that was blocked recovers back to override-approved', () => {
    const blocked = makeProposal({ status: 'waiting-sync', overrideAuditId: 'override-audit-001' });
    const recovered = requeueAfterWorkspaceRecovery(blocked, 'clean');
    expect(recovered.status).toBe('override-approved');
  });

  test('a blocked proposal stays blocked while the workspace is still dirty', () => {
    const blocked = makeProposal({ status: 'waiting-sync' });
    const recovered = requeueAfterWorkspaceRecovery(blocked, 'dirty');
    expect(recovered.status).toBe('waiting-sync');
  });
});

describe('run drift abort', () => {
  test('a write-related running run is aborted when a newer snapshot has landed', () => {
    const decision = evaluateRunAgainstSnapshotDrift(
      { runId: 'run-001', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: true },
      'snap-0002',
    );
    expect(decision.shouldAbort).toBe(true);
    expect(decision.run.status).toBe('aborted');
    expect(decision.driftReason).toBeDefined();
  });

  test('a run based on the latest snapshot is left untouched', () => {
    const decision = evaluateRunAgainstSnapshotDrift(
      { runId: 'run-001', status: 'running', basedOnCanonicalVersion: 'snap-0002', isWriteRelated: true },
      'snap-0002',
    );
    expect(decision.shouldAbort).toBe(false);
  });

  test('read-only runs are never aborted by drift', () => {
    const decision = evaluateRunAgainstSnapshotDrift(
      { runId: 'run-001', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: false },
      'snap-0002',
    );
    expect(decision.shouldAbort).toBe(false);
  });

  test('abortDriftedRuns filters to only the runs that need aborting', () => {
    const decisions = abortDriftedRuns(
      [
        { runId: 'run-a', status: 'running', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: true },
        { runId: 'run-b', status: 'running', basedOnCanonicalVersion: 'snap-0002', isWriteRelated: true },
        { runId: 'run-c', status: 'completed', basedOnCanonicalVersion: 'snap-0001', isWriteRelated: true },
      ],
      'snap-0002',
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.run.runId).toBe('run-a');
  });
});

describe('artifact workflow skeletons', () => {
  test('resolveArtifactWorkflow finds registered artifact types', () => {
    expect(resolveArtifactWorkflow('project-brief')?.artifactType).toBe('project-brief');
    expect(resolveArtifactWorkflow('world-foundation')?.artifactType).toBe('world-foundation');
    expect(resolveArtifactWorkflow('story-blueprint')?.artifactType).toBe('story-blueprint');
    expect(resolveArtifactWorkflow('chapter-manuscript')?.artifactType).toBe('chapter-manuscript');
    expect(resolveArtifactWorkflow('volume-outline')?.artifactType).toBe('volume-outline');
    expect(resolveArtifactWorkflow('world-change')?.artifactType).toBe('world-change');
    expect(resolveArtifactWorkflow('character-update')?.artifactType).toBe('character-update');
    expect(resolveArtifactWorkflow('faction-update')?.artifactType).toBe('faction-update');
    expect(resolveArtifactWorkflow('location-update')?.artifactType).toBe('location-update');
    expect(resolveArtifactWorkflow('tech-rule-update')?.artifactType).toBe('tech-rule-update');
    expect(resolveArtifactWorkflow('fact-update')?.artifactType).toBe('fact-update');
    expect(resolveArtifactWorkflow('relationship-update')?.artifactType).toBe('relationship-update');
    expect(resolveArtifactWorkflow('resource-update')?.artifactType).toBe('resource-update');
  });

  test('chapterOutlineWorkflow.propose rejects a proposal with a mismatched artifactType', () => {
    const registry = buildProposalRegistry([]);
    expect(() =>
      chapterOutlineWorkflow.propose({
        proposal: makeProposal({ artifactType: 'world-change' }),
        registry,
      }),
    ).toThrow();
  });

  test('chapterOutlineWorkflow full happy path: propose -> approve -> commit', () => {
    const registry = buildProposalRegistry([]);
    const { created } = chapterOutlineWorkflow.propose({ proposal: makeProposal(), registry });

    const approval = chapterOutlineWorkflow.approve(created, 'snap-0001', false);
    expect(approval.accepted).toBe(true);
    if (!approval.accepted) {
      return;
    }

    const commit = chapterOutlineWorkflow.commit(approval.proposal, 'clean');
    expect(commit.canCommit).toBe(true);
  });
});
