import { afterEach, describe, expect, test } from 'bun:test';

import type { Proposal } from '../domain';

import { prisma } from './client';
import { findProposal, listActiveProposalsForBook, persistProposal } from './proposals';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];
const createdProposalIds: string[] = [];

const workspaceId = `workspace-proposals-test-${Date.now().toString(36)}`;
const bookId = 'book-proposals-test';
const parentRunId = `run-proposals-test-${Date.now().toString(36)}`;

const proposal: Proposal = {
  proposalId: `proposal-proposals-test-${Date.now().toString(36)}`,
  artifactType: 'chapter-outline',
  targetId: 'chapter-proposals-test',
  status: 'pending-approval',
  intent: 'propose',
  origin: 'author',
  basedOnCanonicalVersion: 'snap-1',
  parentRunId,
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.proposal.deleteMany({ where: { proposalId: { in: createdProposalIds } } });
  await prisma.run.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('proposal persistence', () => {
  test('round-trips a proposal and lists it as active for the book', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(parentRunId);
    await prisma.run.create({
      data: {
        runId: parentRunId,
        workspaceId,
        bookId,
        commandIntent: 'propose',
        status: 'completed',
        requestedBy: 'author-test',
        idempotencyKey: `idem-run-${Date.now().toString(36)}`,
      },
    });
    createdProposalIds.push(proposal.proposalId);
    await persistProposal(workspaceId, bookId, proposal);

    const restored = await findProposal(proposal.proposalId);
    const active = await listActiveProposalsForBook(workspaceId, bookId);

    expect(restored?.intent).toBe('propose');
    expect(active.map((entry) => entry.proposalId)).toContain(proposal.proposalId);
  });
});
