import type { Proposal } from '../domain';
import type { ProposalArtifactType } from '../domain/values';

import { prisma } from './client';
import { fromProposalRow, toProposalCreateInput, type ProposalRow } from './mappers';

export async function persistProposal(
  workspaceId: string,
  bookId: string,
  proposal: Proposal,
): Promise<void> {
  const data = toProposalCreateInput(workspaceId, bookId, proposal);
  await prisma.proposal.upsert({
    where: { proposalId: data.proposalId },
    create: data,
    update: {
      status: data.status,
      ...(data.latestReviewResultId !== undefined ? { latestReviewResultId: data.latestReviewResultId } : {}),
      ...(data.overrideAuditId !== undefined ? { overrideAuditId: data.overrideAuditId } : {}),
      ...(data.supersedesProposalId !== undefined ? { supersedesProposalId: data.supersedesProposalId } : {}),
      ...(data.bundledDiffRefs !== undefined ? { bundledDiffRefs: data.bundledDiffRefs } : {}),
    },
  });
}

export async function findProposal(proposalId: string): Promise<Proposal | undefined> {
  const row = await prisma.proposal.findUnique({ where: { proposalId } });
  return row === null ? undefined : fromProposalRow(row as unknown as ProposalRow);
}

export async function listActiveProposalsForBook(
  workspaceId: string,
  bookId: string,
): Promise<readonly Proposal[]> {
  const rows = await prisma.proposal.findMany({
    where: {
      workspaceId,
      bookId,
      status: {
        notIn: ['rejected', 'superseded', 'exported', 'deleted'],
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row: unknown) => fromProposalRow(row as unknown as ProposalRow));
}

export async function findActiveProposalForTarget(
  workspaceId: string,
  bookId: string,
  artifactType: ProposalArtifactType,
  targetId: string,
): Promise<Proposal | undefined> {
  const row = await prisma.proposal.findFirst({
    where: {
      workspaceId,
      bookId,
      artifactType,
      targetId,
      status: { notIn: ['rejected', 'superseded', 'exported', 'deleted'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return row === null ? undefined : fromProposalRow(row as unknown as ProposalRow);
}
