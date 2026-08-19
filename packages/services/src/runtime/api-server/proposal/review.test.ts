import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope, Proposal } from '../../../domain';
import { RunEventBus } from '../../event-bus';
import { RuntimeStore } from '../../store';
import { applySubmitReviewCommand, countUnresolvedThreadsForProposalChain, parseSubmitReviewPayload } from './review';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-review-cmd',
    artifactType: 'chapter-outline',
    targetId: 'chapter-review-cmd',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: 'snap-1',
    parentRunId: 'run-review-cmd',
    ...overrides,
  };
}

function envelope(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    workspaceId: 'workspace-review',
    bookId: 'book-review',
    artifactType: 'chapter-outline',
    targetId: 'chapter-review-cmd',
    intent: 'submit-review',
    requestedBy: 'author-test',
    approvalMode: 'manual',
    idempotencyKey: 'idem-review-1',
    ...overrides,
  };
}

function reviewPayload() {
  return {
    proposalId: 'proposal-review-cmd',
    author: 'author-test',
    newThreads: [
      {
        proposalId: 'proposal-review-cmd',
        field: 'content',
        side: 'R',
        lineNumber: 3,
        lineSnapshot: 'line three',
        body: '请改这里',
      },
    ],
    replies: [],
  };
}

function setup() {
  const store = new RuntimeStore();
  const eventBus = new RunEventBus();
  store.saveProposal(proposal());
  store.upsertArtifact({ artifactType: 'chapter-outline', targetId: 'chapter-review-cmd' });
  return { store, eventBus };
}

const options = {} as never;

describe('applySubmitReviewCommand', () => {
  test('moves the proposal to changes-requested and persists threads and comments', async () => {
    const { store, eventBus } = setup();
    await applySubmitReviewCommand({
      store,
      eventBus,
      envelope: envelope(),
      runId: 'run-review-cmd',
      payload: reviewPayload(),
      getWorkspaceValidity: () => 'clean',
      options,
    });
    expect(store.getProposal('proposal-review-cmd')?.status).toBe('changes-requested');
    const threads = store.listReviewThreads('proposal-review-cmd');
    expect(threads).toHaveLength(1);
    expect(threads[0]?.side).toBe('R');
    expect(store.listReviewComments(threads[0]?.threadId ?? '')).toHaveLength(1);
    expect(store.listProposalReviews('proposal-review-cmd')).toHaveLength(1);
    expect(eventBus.history('run-review-cmd').some((event) => event.type === 'proposal.review-submitted')).toBe(true);
  });

  test('ignores non submit-review intents', async () => {
    const { store, eventBus } = setup();
    await applySubmitReviewCommand({
      store,
      eventBus,
      envelope: envelope({ intent: 'approve' }),
      runId: 'run-review-cmd',
      payload: reviewPayload(),
      getWorkspaceValidity: () => 'clean',
      options,
    });
    expect(store.getProposal('proposal-review-cmd')?.status).toBe('pending-approval');
    expect(store.listReviewThreads('proposal-review-cmd')).toHaveLength(0);
  });

  test('publishes a step failure for an invalid payload', async () => {
    const { store, eventBus } = setup();
    await applySubmitReviewCommand({
      store,
      eventBus,
      envelope: envelope(),
      runId: 'run-review-cmd',
      payload: { nope: true },
      getWorkspaceValidity: () => 'clean',
      options,
    });
    expect(store.getProposal('proposal-review-cmd')?.status).toBe('pending-approval');
    expect(eventBus.history('run-review-cmd').some((event) => event.type === 'run.step.failed')).toBe(true);
  });

  test('publishes a step failure when the proposal is not reviewable', async () => {
    const { store, eventBus } = setup();
    store.saveProposal(proposal({ status: 'approved' }));
    await applySubmitReviewCommand({
      store,
      eventBus,
      envelope: envelope(),
      runId: 'run-review-cmd',
      payload: reviewPayload(),
      getWorkspaceValidity: () => 'clean',
      options,
    });
    expect(eventBus.history('run-review-cmd').some((event) => event.type === 'run.step.failed')).toBe(true);
  });
});

describe('parseSubmitReviewPayload', () => {
  test('rejects an empty review payload', () => {
    expect(parseSubmitReviewPayload({ proposalId: 'x', author: 'a', newThreads: [], replies: [] })).toBeUndefined();
  });
});

describe('countUnresolvedThreadsForProposalChain', () => {
  test('counts unresolved threads across the supersedes chain', () => {
    const store = new RuntimeStore();
    store.saveProposal(proposal({ proposalId: 'proposal-review-old', status: 'superseded' }));
    const newer = proposal({ proposalId: 'proposal-review-new', supersedesProposalId: 'proposal-review-cmd' });
    store.saveProposal(newer);
    store.saveReviewThread({
      threadId: 't1',
      proposalId: 'proposal-review-new',
      field: 'content',
      side: 'R',
      lineNumber: 1,
      lineSnapshot: 'x',
      isResolved: false,
      createdAt: 't',
    });
    store.saveReviewThread({
      threadId: 't2',
      proposalId: 'proposal-review-cmd',
      field: 'content',
      side: 'R',
      lineNumber: 2,
      lineSnapshot: 'y',
      isResolved: true,
      createdAt: 't',
    });
    expect(countUnresolvedThreadsForProposalChain(store, newer)).toBe(1);
  });
});
