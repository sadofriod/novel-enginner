import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope, Proposal } from '../domain';

import { applyProposalCommand } from './command-lifecycle';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-chapter-0001-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    status: 'pending-approval',
    intent: 'propose',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-0001',
    ...overrides,
  };
}

function command(intent: CommandEnvelope['intent']): CommandEnvelope {
  return {
    workspaceId: 'workspace-001',
    bookId: 'book-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    intent,
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `command-${intent}`,
  };
}

describe('proposal command lifecycle', () => {
  test('approves and commits when snapshot and workspace are clean', () => {
    const result = applyProposalCommand({
      envelope: command('approve'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.proposal.status).toBe('approved');
      expect(result.canCommit).toBe(true);
    }
  });

  test('moves approval to waiting-sync when workspace is dirty', () => {
    const result = applyProposalCommand({
      envelope: command('approve'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'dirty',
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.proposal.status).toBe('waiting-sync');
      expect(result.canCommit).toBe(false);
    }
  });

  test('rejects approval on snapshot drift', () => {
    const result = applyProposalCommand({
      envelope: command('approve'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0002',
      workspaceValidity: 'clean',
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toContain('stale');
    }
  });

  test('retries a previously approved canonical commit after an earlier write failure', () => {
    const result = applyProposalCommand({
      envelope: command('approve'),
      proposal: proposal({ status: 'approved' }),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
    });

    expect(result).toEqual({
      accepted: true,
      proposal: proposal({ status: 'approved' }),
      canCommit: true,
    });
  });

  test('uses a repeated approval as explicit confirmation after waiting-sync recovery', () => {
    const result = applyProposalCommand({
      envelope: command('approve'),
      proposal: proposal({ status: 'waiting-sync' }),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
    });

    expect(result).toEqual({
      accepted: true,
      proposal: proposal({ status: 'approved' }),
      canCommit: true,
    });
  });

  test('supports reject and export terminal decisions', () => {
    const rejected = applyProposalCommand({
      envelope: command('reject'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
    });
    const exported = applyProposalCommand({
      envelope: command('export-draft'),
      proposal: proposal(),
      currentCanonicalVersion: 'snap-0001',
      workspaceValidity: 'clean',
    });

    expect(rejected.accepted && rejected.proposal.status).toBe('rejected');
    expect(exported.accepted && exported.proposal.status).toBe('exported');
  });
});