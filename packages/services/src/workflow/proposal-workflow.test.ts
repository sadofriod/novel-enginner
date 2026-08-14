import { describe, expect, test } from 'bun:test';

import type { Proposal } from '../domain/schema';

import {
  abortDriftedRuns,
  attemptCanonicalCommit,
  buildProposalRegistry,
  chapterOutlineWorkflow,
  createProposal,
  decideApproval,
  evaluateRunAgainstSnapshotDrift,
  exportDraft,
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
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-chapter-0042-001',
    ...overrides,
  };
}

describe('proposal creation and supersede', () => {
  test('first proposal for a target has no supersedesProposalId', () => {
    const registry = buildProposalRegistry([]);
    const result = createProposal({ proposal: makeProposal(), registry });
    expect(result.created.supersedesProposalId).toBeUndefined();
    expect(result.superseded).toBeUndefined();
  });

  test('a second propose for the same artifactType+targetId supersedes the old active one', () => {
    const previous = makeProposal({ proposalId: 'proposal-chapter-0042-001' });
    const registry = buildProposalRegistry([previous]);
    const next = makeProposal({
      proposalId: 'proposal-chapter-0042-002',
      basedOnCanonicalVersion: 'snap-0002',
    });

    const result = createProposal({ proposal: next, registry });

    expect(result.superseded?.proposalId).toBe('proposal-chapter-0042-001');
    expect(result.superseded?.status).toBe('superseded');
    expect(result.created.supersedesProposalId).toBe('proposal-chapter-0042-001');
  });

  test('a terminal (already superseded) proposal is not treated as active', () => {
    const oldTerminal = makeProposal({ proposalId: 'proposal-old', status: 'superseded' });
    const registry = buildProposalRegistry([oldTerminal]);
    const next = makeProposal({ proposalId: 'proposal-new' });

    const result = createProposal({ proposal: next, registry });

    expect(result.superseded).toBeUndefined();
    expect(result.created.supersedesProposalId).toBeUndefined();
  });

  test('proposals for different targets do not supersede each other', () => {
    const other = makeProposal({ proposalId: 'proposal-other', targetId: 'chapter-0099-outline' });
    const registry = buildProposalRegistry([other]);
    const next = makeProposal({ proposalId: 'proposal-new' });

    const result = createProposal({ proposal: next, registry });

    expect(result.superseded).toBeUndefined();
  });
});

describe('approval and override transitions', () => {
  test('approve succeeds when the proposal snapshot matches the current canonical version', () => {
    const proposal = makeProposal();
    const decision = decideApproval({
      proposal,
      currentCanonicalVersion: 'snap-0001',
      isOverride: false,
    });

    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.proposal.status).toBe('approved');
    }
  });

  test('approve is rejected on snapshot drift', () => {
    const proposal = makeProposal();
    const decision = decideApproval({
      proposal,
      currentCanonicalVersion: 'snap-0002',
      isOverride: false,
    });

    expect(decision.accepted).toBe(false);
    if (!decision.accepted) {
      expect(decision.reason).toBe('snapshot-drift');
    }
  });

  test('override-approve sets override-approved status and records the audit id', () => {
    const proposal = makeProposal();
    const decision = decideApproval({
      proposal,
      currentCanonicalVersion: 'snap-0001',
      isOverride: true,
      overrideAuditId: 'override-audit-001',
    });

    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.proposal.status).toBe('override-approved');
      expect(decision.proposal.overrideAuditId).toBe('override-audit-001');
    }
  });

  test('approving a proposal that is not pending is rejected', () => {
    const proposal = makeProposal({ status: 'approved' });
    const decision = decideApproval({
      proposal,
      currentCanonicalVersion: 'snap-0001',
      isOverride: false,
    });

    expect(decision.accepted).toBe(false);
    if (!decision.accepted) {
      expect(decision.reason).toBe('not-pending-approval');
    }
  });
});

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

describe('export-draft terminal action', () => {
  test('export-draft moves a proposal to exported', () => {
    const proposal = makeProposal({ status: 'approved' });
    const exported = exportDraft(proposal);
    expect(exported.status).toBe('exported');
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
