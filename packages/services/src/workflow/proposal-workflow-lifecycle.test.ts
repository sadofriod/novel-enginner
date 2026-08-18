import { describe, expect, test } from 'bun:test';

import type { Proposal } from '../domain/schema';
import type { ReviewerResult } from '../domain/schema';

import { buildProposalRegistry, createProposal, decideApproval, exportDraft } from './index';

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

function makeReviewerResult(overrides: Partial<ReviewerResult> = {}): ReviewerResult {
  return {
    approved: true,
    hardFailures: [],
    dimensionScores: {
      antiAiVoice: 80,
      webFictionPacing: 80,
      emotionCurve: 80,
      characterConsistency: 80,
      settingConsistency: 80,
      clueCausality: 80,
      readabilityLayout: 80,
      languageTexture: 80,
    },
    totalScore: 80,
    rewriteDirectives: [],
    overrideEligible: true,
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

  test('a retry with the same proposal id does not supersede itself', () => {
    const proposal = makeProposal();
    const result = createProposal({
      proposal,
      registry: buildProposalRegistry([proposal]),
    });

    expect(result).toEqual({ created: proposal });
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
  test('strict approval requires a ReviewerResult', () => {
    const decision = decideApproval({
      proposal: makeProposal(),
      currentCanonicalVersion: 'snap-0001',
      isOverride: false,
      requireReviewerResult: true,
    });

    expect(decision).toMatchObject({ accepted: false, reason: 'review-required' });
  });

  test('strict normal approval rejects a failed review', () => {
    const decision = decideApproval({
      proposal: makeProposal(),
      currentCanonicalVersion: 'snap-0001',
      isOverride: false,
      requireReviewerResult: true,
      reviewerResult: makeReviewerResult({ approved: false }),
    });

    expect(decision).toMatchObject({ accepted: false, reason: 'review-rejected' });
  });

  test('strict override approval rejects a non-overridable review', () => {
    const decision = decideApproval({
      proposal: makeProposal(),
      currentCanonicalVersion: 'snap-0001',
      isOverride: true,
      requireReviewerResult: true,
      reviewerResult: makeReviewerResult({ overrideEligible: false }),
    });

    expect(decision).toMatchObject({ accepted: false, reason: 'override-not-eligible' });
  });

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

describe('export-draft terminal action', () => {
  test('export-draft moves a proposal to exported', () => {
    const proposal = makeProposal({ status: 'approved' });
    const exported = exportDraft(proposal);
    expect(exported.status).toBe('exported');
  });
});
