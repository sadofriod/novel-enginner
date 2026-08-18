import { describe, expect, test } from 'bun:test';

import { CommandEnvelopeSchema, ProposalSchema } from './proposal';

describe('proposal and command schemas', () => {
  test('ProposalSchema accepts expanded artifact types', () => {
    expect(
      ProposalSchema.parse({
        proposalId: 'proposal-project-brief-001',
        artifactType: 'project-brief',
        targetId: 'project-brief-001',
        status: 'pending-approval',
        intent: 'propose',
        basedOnCanonicalVersion: 'snap-book-001',
        parentRunId: 'run-001',
      }),
    ).toMatchObject({ artifactType: 'project-brief' });
  });

  test('ProposalSchema accepts chapter-manuscript artifact types', () => {
    expect(
      ProposalSchema.parse({
        proposalId: 'proposal-chapter-manuscript-001',
        artifactType: 'chapter-manuscript',
        targetId: 'manuscript-1',
        status: 'pending-approval',
        intent: 'propose',
        basedOnCanonicalVersion: 'snap-1',
        parentRunId: 'run-001',
      }),
    ).toMatchObject({ artifactType: 'chapter-manuscript' });
  });

  test('ProposalSchema defaults origin to author and validates origin values', () => {
    const base = {
      proposalId: 'proposal-origin-001',
      artifactType: 'chapter-outline',
      targetId: 'chapter-1',
      status: 'pending-approval',
      intent: 'propose',
      basedOnCanonicalVersion: 'snap-1',
      parentRunId: 'run-001',
    };
    expect(ProposalSchema.parse(base).origin).toBe('author');
    expect(ProposalSchema.parse({ ...base, origin: 'imported' }).origin).toBe('imported');
    expect(ProposalSchema.parse({ ...base, origin: 'generated' }).origin).toBe('generated');
    expect(ProposalSchema.safeParse({ ...base, origin: 'unknown-origin' }).success).toBe(false);
  });

  test('CommandEnvelopeSchema requires workspace, book, intent, requester, and idempotency', () => {
    expect(
      CommandEnvelopeSchema.parse({
        workspaceId: 'ws-1',
        bookId: 'book-1',
        artifactType: 'chapter-outline',
        targetId: 'chapter-1',
        intent: 'propose',
        requestedBy: 'user-1',
        approvalMode: 'manual',
        idempotencyKey: 'key-1',
      }),
    ).toMatchObject({ intent: 'propose' });
    expect(
      CommandEnvelopeSchema.safeParse({
        workspaceId: 'ws-1',
        bookId: 'book-1',
        intent: 'propose',
        requestedBy: 'user-1',
        approvalMode: 'manual',
        idempotencyKey: '',
      }).success,
    ).toBe(false);
  });
});
