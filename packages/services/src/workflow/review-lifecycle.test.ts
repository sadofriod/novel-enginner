import { describe, expect, test } from 'bun:test';

import type { Proposal, ProposalReview, ReviewThread, SubmitReviewInput } from '../domain/schema';
import { PROPOSAL_STATUS_VALUES, REVIEW_DISPOSITION_VALUES, THREAD_SIDE_VALUES } from '../domain/values';
import {
  ReviewWorkflowError,
  applySubmitReview,
  buildProposalChain,
  buildSubmitReview,
  countUnresolvedThreadsForProposals,
  isApproveBlockedByUnresolvedThreads,
  resolveThread,
  unresolveThread,
} from './review-lifecycle';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-test',
    artifactType: 'chapter-outline',
    targetId: 'chapter-test',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: 'snap-1',
    parentRunId: 'run-test',
    ...overrides,
  };
}

function thread(threadId: string, isResolved: boolean): ReviewThread {
  return {
    threadId,
    proposalId: 'p',
    field: 'content',
    side: 'R',
    lineNumber: 1,
    lineSnapshot: 'x',
    isResolved,
    createdAt: 't',
  };
}

function submitInput(overrides: Partial<SubmitReviewInput> = {}): SubmitReviewInput {
  return {
    proposalId: 'proposal-test',
    author: 'author-test',
    newThreads: [
      {
        proposalId: 'proposal-test',
        field: 'content',
        side: 'R',
        lineNumber: 3,
        lineSnapshot: 'line three',
        body: '请改这里',
      },
    ],
    replies: [],
    ...overrides,
  };
}

const identity = { id: () => 'id-x', now: () => '2026-08-19T00:00:00Z' };

describe('review workflow values', () => {
  test('adds changes-requested and review dispositions to the domain vocabulary', () => {
    expect(PROPOSAL_STATUS_VALUES).toContain('changes-requested');
    expect(REVIEW_DISPOSITION_VALUES).toEqual(['request-changes']);
    expect(THREAD_SIDE_VALUES).toEqual(['L', 'R']);
  });
});

describe('applySubmitReview', () => {
  test('moves a pending-approval proposal to changes-requested', () => {
    const review: ProposalReview = {
      reviewId: 'review-1',
      proposalId: 'proposal-test',
      disposition: 'request-changes',
      submittedAt: 't1',
    };
    expect(applySubmitReview(proposal(), review).status).toBe('changes-requested');
  });

  test('rejects submitting a review on a non-reviewable proposal', () => {
    const review: ProposalReview = {
      reviewId: 'review-1',
      proposalId: 'proposal-test',
      disposition: 'request-changes',
      submittedAt: 't1',
    };
    expect(() => applySubmitReview(proposal({ status: 'approved' }), review)).toThrow(ReviewWorkflowError);
  });
});

describe('buildSubmitReview', () => {
  test('assembles a review with threads and comments from the submit input', () => {
    const result = buildSubmitReview(submitInput(), identity);
    expect(result.review.disposition).toBe('request-changes');
    expect(result.threads).toHaveLength(1);
    expect(result.comments).toHaveLength(1);
    expect(result.threads[0]).toMatchObject({ side: 'R', lineNumber: 3, isResolved: false });
    expect(result.comments[0]).toMatchObject({ author: 'author-test', body: '请改这里' });
  });

  test('rejects an empty review submission', () => {
    expect(() => buildSubmitReview(submitInput({ newThreads: [] }), identity)).toThrow(ReviewWorkflowError);
  });

  test('carries a multi-line anchor when the draft specifies lineCount', () => {
    const result = buildSubmitReview(
      submitInput({
        newThreads: [
          {
            proposalId: 'proposal-test',
            field: 'content',
            side: 'R',
            lineNumber: 3,
            lineCount: 3,
            lineSnapshot: 'a\nb\nc',
            body: '这段都要改',
          },
        ],
      }),
      identity,
    );
    expect(result.threads[0]?.lineNumber).toBe(3);
    expect(result.threads[0]?.lineCount).toBe(3);
  });
});

describe('thread resolve', () => {
  test('resolves and unresolves a thread', () => {
    const resolved = resolveThread(thread('th-1', false), 'author-test', 't2');
    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedBy).toBe('author-test');
    expect(resolved.resolvedAt).toBe('t2');
    const unresolved = unresolveThread(resolved);
    expect(unresolved.isResolved).toBe(false);
    expect(unresolved.resolvedBy).toBeUndefined();
  });
});

describe('approval gating across the proposal chain', () => {
  test('builds the supersedes chain from the current proposal back to the root', () => {
    const v3 = proposal({ proposalId: 'p3', supersedesProposalId: 'p2' });
    const v2 = proposal({ proposalId: 'p2', status: 'superseded', supersedesProposalId: 'p1' });
    const v1 = proposal({ proposalId: 'p1', status: 'superseded' });
    expect(buildProposalChain([v1, v3, v2], 'p3').map((entry) => entry.proposalId)).toEqual(['p3', 'p2', 'p1']);
  });

  test('counts unresolved threads across every round of the chain', () => {
    const v2 = proposal({ proposalId: 'p2', supersedesProposalId: 'p1' });
    const v1 = proposal({ proposalId: 'p1', status: 'superseded' });
    const threadsByProposal = new Map<string, readonly ReviewThread[]>([
      ['p1', [thread('t1', false)]],
      ['p2', [thread('t2', false), thread('t3', true)]],
    ]);
    expect(countUnresolvedThreadsForProposals(threadsByProposal, [v1, v2], 'p2')).toBe(2);
  });

  test('blocks approve only when unresolved threads remain and no override', () => {
    expect(isApproveBlockedByUnresolvedThreads(0, false)).toBe(false);
    expect(isApproveBlockedByUnresolvedThreads(2, false)).toBe(true);
    expect(isApproveBlockedByUnresolvedThreads(2, true)).toBe(false);
  });
});
