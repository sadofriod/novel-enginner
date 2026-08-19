import type { Proposal } from '../../../domain';
import type { CanonicalDraft } from '../../store';
import { findProposal } from '../../../persistence/proposals';
import { findPersistedCanonicalDraft } from '../../../persistence/proposal-drafts';
import { listThreadsForProposal, type ReviewThreadWithComments } from '../../../persistence/reviews';
import { RuntimeStore } from '../../store';

/** One round of a proposal's supersedes chain, with its draft content and threads. */
export interface ProposalChainEntry {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly status: string;
  readonly intent: string;
  readonly supersedesProposalId?: string;
  readonly basedOnCanonicalVersion: string;
  readonly content?: string;
  readonly threads: readonly ReviewThreadWithComments[];
}

export interface LoadProposalChainInput {
  readonly store: RuntimeStore;
  readonly persistenceEnabled: boolean;
  readonly startProposalId: string;
}

async function loadProposal(input: LoadProposalChainInput, proposalId: string): Promise<Proposal | undefined> {
  const fromStore = input.store.getProposal(proposalId);
  if (fromStore !== undefined) {
    return fromStore;
  }
  if (!input.persistenceEnabled) {
    return undefined;
  }
  return findProposal(proposalId);
}

async function loadDraft(input: LoadProposalChainInput, proposalId: string): Promise<CanonicalDraft | undefined> {
  const fromStore = input.store.getCanonicalDraft(proposalId);
  if (fromStore !== undefined) {
    return fromStore;
  }
  if (!input.persistenceEnabled) {
    return undefined;
  }
  return findPersistedCanonicalDraft(proposalId);
}

async function loadThreads(
  input: LoadProposalChainInput,
  proposalId: string,
): Promise<readonly ReviewThreadWithComments[]> {
  const fromStore = input.store
    .listReviewThreads(proposalId)
    .map((thread) => ({ thread, comments: input.store.listReviewComments(thread.threadId) }));
  if (fromStore.length > 0 || !input.persistenceEnabled) {
    return fromStore;
  }
  return listThreadsForProposal(proposalId);
}

async function buildChainEntry(
  input: LoadProposalChainInput,
  proposal: Proposal,
): Promise<ProposalChainEntry> {
  const draft = await loadDraft(input, proposal.proposalId);
  const threads = await loadThreads(input, proposal.proposalId);
  return {
    proposalId: proposal.proposalId,
    artifactType: proposal.artifactType,
    targetId: proposal.targetId,
    status: proposal.status,
    intent: proposal.intent,
    ...(proposal.supersedesProposalId === undefined ? {} : { supersedesProposalId: proposal.supersedesProposalId }),
    basedOnCanonicalVersion: proposal.basedOnCanonicalVersion,
    ...(draft === undefined ? {} : { content: draft.content }),
    threads,
  };
}

/**
 * Loads the proposal's supersedes chain (current → oldest round), attaching each
 * round's canonical draft content and review threads so the UI can switch rounds
 * and render per-round diffs + threads (GitHub-style "view older versions").
 */
export async function loadProposalChain(input: LoadProposalChainInput): Promise<readonly ProposalChainEntry[]> {
  const entries: ProposalChainEntry[] = [];
  let proposalId: string | undefined = input.startProposalId;
  let guard = 0;
  while (proposalId !== undefined && guard < 32) {
    const proposal = await loadProposal(input, proposalId);
    if (proposal === undefined) {
      break;
    }
    entries.push(await buildChainEntry(input, proposal));
    proposalId = proposal.supersedesProposalId;
    guard += 1;
  }
  return entries;
}
