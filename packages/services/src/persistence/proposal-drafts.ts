import type { Proposal } from '../domain';
import type { CanonicalDraft } from '../runtime/store';
import { validateCanonicalDraftForProposal } from '../runtime/canonical-draft';

import { prisma } from './client';

export async function persistCanonicalDraft(input: {
  readonly draft: CanonicalDraft;
  readonly proposal: Pick<Proposal, 'artifactType' | 'targetId'>;
}): Promise<void> {
  const validatedDraft = validateCanonicalDraftForProposal(input.draft, input.proposal);
  await prisma.proposalDraft.upsert({
    where: { proposalId: validatedDraft.proposalId },
    create: validatedDraft,
    update: {
      relativePath: validatedDraft.relativePath,
      content: validatedDraft.content,
    },
  });
}

export async function findPersistedCanonicalDraft(proposalId: string): Promise<CanonicalDraft | undefined> {
  const draft = await prisma.proposalDraft.findUnique({ where: { proposalId } });
  if (draft === null) {
    return undefined;
  }
  return {
    proposalId: draft.proposalId,
    relativePath: draft.relativePath,
    content: draft.content,
  };
}
