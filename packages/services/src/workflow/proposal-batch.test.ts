import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope, Proposal, ReviewerResult } from '../domain';

import { approveProposalBatch } from './proposal-batch';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-batch-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'author',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-batch-001',
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
    overrideEligible: false,
    rewriteDirectives: [],
    ...overrides,
  };
}

const envelope: CommandEnvelope = {
  workspaceId: 'workspace-001',
  bookId: 'book-001',
  intent: 'approve-batch',
  proposalIds: ['proposal-batch-001', 'proposal-batch-002', 'proposal-batch-003'],
  requestedBy: 'user-001',
  approvalMode: 'manual',
  idempotencyKey: 'batch-001',
};

describe('approveProposalBatch', () => {
  test('approves eligible proposals and reports reasons for ineligible ones in order', () => {
    const results = approveProposalBatch({
      envelope,
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map([['proposal-batch-001', makeReviewerResult()]]),
      proposals: [
        makeProposal({ proposalId: 'proposal-batch-001' }),
        makeProposal({ proposalId: 'proposal-batch-002', basedOnCanonicalVersion: 'snap-0000' }),
        makeProposal({ proposalId: 'proposal-batch-003', status: 'rejected' }),
      ],
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ proposalId: 'proposal-batch-001', accepted: true, canCommit: true });
    expect(results[1]).toMatchObject({ proposalId: 'proposal-batch-002', accepted: false, reason: expect.stringContaining('stale') });
    expect(results[2]).toMatchObject({ proposalId: 'proposal-batch-003', accepted: false });
  });

  test('blocks a proposal whose reviewer result is missing when required', () => {
    const results = approveProposalBatch({
      envelope,
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map(),
      proposals: [makeProposal({ proposalId: 'proposal-batch-001' })],
    });

    expect(results[0]).toMatchObject({ accepted: false, reason: expect.stringContaining('ReviewerResult') });
  });

  test('rejects a proposal whose latest review was rejected', () => {
    const results = approveProposalBatch({
      envelope,
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map([
        [
          'proposal-batch-001',
          makeReviewerResult({ approved: false, hardFailures: [{ code: 'banned-terms-hit', message: 'banned term present' }] }),
        ],
      ]),
      proposals: [makeProposal({ proposalId: 'proposal-batch-001' })],
    });

    expect(results[0]).toMatchObject({ accepted: false, reason: expect.stringContaining('rejected') });
  });

  test('a proposal in a dirty workspace is accepted but not committed', () => {
    const results = approveProposalBatch({
      envelope,
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'dirty',
      requireReviewerResult: true,
      reviewerResults: new Map([['proposal-batch-001', makeReviewerResult()]]),
      proposals: [makeProposal({ proposalId: 'proposal-batch-001' })],
    });

    expect(results[0]).toMatchObject({ accepted: true, canCommit: false });
    expect(results[0]).toMatchObject({ proposal: expect.objectContaining({ status: 'waiting-sync' }) });
  });

  test('requires real model evidence for imported-origin proposals', () => {
    const imported = makeProposal({ proposalId: 'proposal-imported-001', origin: 'imported' });
    const rulesOnly = approveProposalBatch({
      envelope: { ...envelope, proposalIds: [imported.proposalId] },
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map([[imported.proposalId, makeReviewerResult({ evidenceSource: 'rules' })]]),
      proposals: [imported],
    });
    expect(rulesOnly[0]).toMatchObject({ accepted: false, reason: expect.stringContaining('model evidence') });

    const withModel = approveProposalBatch({
      envelope: { ...envelope, proposalIds: [imported.proposalId] },
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map([[imported.proposalId, makeReviewerResult({ evidenceSource: 'model' })]]),
      proposals: [imported],
    });
    expect(withModel[0]).toMatchObject({ accepted: true });
  });

  test('does not require model evidence for author-origin proposals', () => {
    const author = makeProposal({ proposalId: 'proposal-author-001', origin: 'author' });
    const results = approveProposalBatch({
      envelope: { ...envelope, proposalIds: [author.proposalId] },
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
      requireReviewerResult: true,
      reviewerResults: new Map([[author.proposalId, makeReviewerResult({ evidenceSource: 'rules' })]]),
      proposals: [author],
    });
    expect(results[0]).toMatchObject({ accepted: true });
  });
});
