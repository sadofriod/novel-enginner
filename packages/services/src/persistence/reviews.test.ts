import { afterEach, describe, expect, test } from 'bun:test';

import type { ProposalReview, ReviewComment, ReviewThread } from '../domain';

import { prisma } from './client';
import {
  countUnresolvedThreadsForProposalIds,
  listThreadsForProposal,
  persistComment,
  persistReviewSubmit,
  persistThreadResolved,
} from './reviews';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];
const createdProposalIds: string[] = [];
const createdReviewIds: string[] = [];

const runId = `run-reviews-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-reviews-test-${Date.now().toString(36)}`;
const bookId = 'book-reviews-test';
const proposalId = `proposal-reviews-test-${Date.now().toString(36)}`;

const review: ProposalReview = {
  reviewId: `review-reviews-test-${Date.now().toString(36)}`,
  proposalId,
  disposition: 'request-changes',
  overallComment: '整体意见',
  submittedAt: '2026-08-19T00:00:00.000Z',
};

const thread: ReviewThread = {
  threadId: `thread-reviews-test-${Date.now().toString(36)}`,
  proposalId,
  field: 'content',
  side: 'R',
  lineNumber: 3,
  lineSnapshot: 'line three',
  isResolved: false,
  createdAt: '2026-08-19T00:00:00.000Z',
};

const comment: ReviewComment = {
  commentId: `comment-reviews-test-${Date.now().toString(36)}`,
  threadId: thread.threadId,
  author: 'author-test',
  body: '请改这里',
  createdAt: '2026-08-19T00:00:00.000Z',
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.reviewComment.deleteMany({ where: { commentId: { in: [comment.commentId] } } });
  await prisma.reviewThread.deleteMany({ where: { threadId: { in: [thread.threadId] } } });
  await prisma.proposalReview.deleteMany({ where: { reviewId: { in: createdReviewIds } } });
  await prisma.proposal.deleteMany({ where: { proposalId: { in: createdProposalIds } } });
  await prisma.run.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('proposal review persistence', () => {
  test('round-trips a review submission with threads and comments', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await prisma.run.create({
      data: {
        runId,
        workspaceId,
        bookId,
        commandIntent: 'propose',
        status: 'completed',
        requestedBy: 'author-test',
        idempotencyKey: `idem-run-${Date.now().toString(36)}`,
      },
    });
    createdProposalIds.push(proposalId);
    await prisma.proposal.create({
      data: {
        proposalId,
        workspaceId,
        bookId,
        artifactType: 'chapter-outline',
        targetId: 'chapter-reviews-test',
        status: 'pending-approval',
        intent: 'propose',
        origin: 'generated',
        basedOnCanonicalVersion: 'snap-1',
        parentRunId: runId,
      },
    });
    createdReviewIds.push(review.reviewId);
    await persistReviewSubmit(review, [thread], [comment]);

    const threads = await listThreadsForProposal(proposalId);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.thread.side).toBe('R');
    expect(threads[0]?.thread.lineNumber).toBe(3);
    expect(threads[0]?.comments).toHaveLength(1);
    expect(threads[0]?.comments[0]?.body).toBe('请改这里');

    expect(await countUnresolvedThreadsForProposalIds([proposalId])).toBe(1);

    await persistThreadResolved(thread.threadId, 'author-test', '2026-08-19T00:01:00.000Z');
    expect(await countUnresolvedThreadsForProposalIds([proposalId])).toBe(0);

    const reply: ReviewComment = {
      ...comment,
      commentId: `comment-reviews-test-${Date.now().toString(36)}-reply`,
      body: '补充说明',
    };
    await persistComment(reply);
    await prisma.reviewComment.deleteMany({ where: { commentId: { in: [reply.commentId] } } });
  });
});
