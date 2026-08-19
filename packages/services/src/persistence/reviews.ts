import type { ProposalReview, ReviewComment, ReviewThread } from '../domain';
import type { ThreadSide } from '../domain/values';

import { prisma } from './client';

export interface ReviewThreadWithComments {
  readonly thread: ReviewThread;
  readonly comments: readonly ReviewComment[];
}

function toProposalReviewCreateInput(review: ProposalReview): {
  reviewId: string;
  proposalId: string;
  disposition: string;
  overallComment?: string;
  submittedAt: Date;
} {
  return {
    reviewId: review.reviewId,
    proposalId: review.proposalId,
    disposition: review.disposition,
    ...(review.overallComment === undefined ? {} : { overallComment: review.overallComment }),
    submittedAt: new Date(review.submittedAt),
  };
}

function toReviewThreadCreateInput(thread: ReviewThread): {
  threadId: string;
  proposalId: string;
  field: string;
  side: string;
  lineNumber: number;
  lineCount?: number;
  lineSnapshot: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
} {
  return {
    threadId: thread.threadId,
    proposalId: thread.proposalId,
    field: thread.field,
    side: thread.side,
    lineNumber: thread.lineNumber,
    ...(thread.lineCount === undefined ? {} : { lineCount: thread.lineCount }),
    lineSnapshot: thread.lineSnapshot,
    isResolved: thread.isResolved,
    ...(thread.resolvedBy === undefined ? {} : { resolvedBy: thread.resolvedBy }),
    ...(thread.resolvedAt === undefined ? {} : { resolvedAt: new Date(thread.resolvedAt) }),
    createdAt: new Date(thread.createdAt),
  };
}

function toReviewCommentCreateInput(comment: ReviewComment): {
  commentId: string;
  threadId: string;
  author: string;
  body: string;
  createdAt: Date;
} {
  return {
    commentId: comment.commentId,
    threadId: comment.threadId,
    author: comment.author,
    body: comment.body,
    createdAt: new Date(comment.createdAt),
  };
}

interface ReviewThreadRow {
  threadId: string;
  proposalId: string;
  field: string;
  side: string;
  lineNumber: number;
  lineCount: number;
  lineSnapshot: string;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface ReviewCommentRow {
  commentId: string;
  threadId: string;
  author: string;
  body: string;
  createdAt: Date;
}

function fromReviewThreadRow(row: ReviewThreadRow): ReviewThread {
  return {
    threadId: row.threadId,
    proposalId: row.proposalId,
    field: row.field,
    side: row.side as ThreadSide,
    lineNumber: row.lineNumber,
    ...(row.lineCount > 1 ? { lineCount: row.lineCount } : {}),
    lineSnapshot: row.lineSnapshot,
    isResolved: row.isResolved,
    ...(row.resolvedBy === null ? {} : { resolvedBy: row.resolvedBy }),
    ...(row.resolvedAt === null ? {} : { resolvedAt: row.resolvedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
  };
}

function fromReviewCommentRow(row: ReviewCommentRow): ReviewComment {
  return {
    commentId: row.commentId,
    threadId: row.threadId,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Atomically persists one review submission: the review + its threads + comments. */
export async function persistReviewSubmit(
  review: ProposalReview,
  threads: readonly ReviewThread[],
  comments: readonly ReviewComment[],
): Promise<void> {
  await prisma.$transaction([
    prisma.proposalReview.create({ data: toProposalReviewCreateInput(review) }),
    ...threads.map((thread) => prisma.reviewThread.create({ data: toReviewThreadCreateInput(thread) })),
    ...comments.map((comment) => prisma.reviewComment.create({ data: toReviewCommentCreateInput(comment) })),
  ]);
}

export async function findReviewThread(threadId: string): Promise<ReviewThread | undefined> {
  const row = await prisma.reviewThread.findUnique({ where: { threadId } });
  return row === null ? undefined : fromReviewThreadRow(row as unknown as ReviewThreadRow);
}

export async function persistReviewThread(thread: ReviewThread): Promise<void> {
  await prisma.reviewThread.create({ data: toReviewThreadCreateInput(thread) });
}

export async function listThreadsForProposal(
  proposalId: string,
): Promise<readonly ReviewThreadWithComments[]> {
  const rows = await prisma.reviewThread.findMany({
    where: { proposalId },
    include: { comments: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    thread: fromReviewThreadRow(row as unknown as ReviewThreadRow),
    comments: (row.comments as unknown as ReviewCommentRow[]).map(fromReviewCommentRow),
  }));
}

/** Appends a reply comment to an existing thread. */
export async function persistComment(comment: ReviewComment): Promise<void> {
  await prisma.reviewComment.create({ data: toReviewCommentCreateInput(comment) });
}

export async function persistEditComment(commentId: string, body: string): Promise<void> {
  await prisma.reviewComment.update({ where: { commentId }, data: { body } });
}

export async function persistDeleteComment(commentId: string): Promise<void> {
  await prisma.reviewComment.delete({ where: { commentId } });
}

export async function persistThreadResolved(
  threadId: string,
  resolvedBy: string,
  resolvedAt: string,
): Promise<void> {
  await prisma.reviewThread.update({
    where: { threadId },
    data: { isResolved: true, resolvedBy, resolvedAt: new Date(resolvedAt) },
  });
}

export async function persistThreadUnresolved(threadId: string): Promise<void> {
  await prisma.reviewThread.update({
    where: { threadId },
    data: { isResolved: false, resolvedBy: null, resolvedAt: null },
  });
}

/** Counts unresolved threads across the given proposal ids (chain-wide approve gating). */
export async function countUnresolvedThreadsForProposalIds(
  proposalIds: readonly string[],
): Promise<number> {
  if (proposalIds.length === 0) {
    return 0;
  }
  return prisma.reviewThread.count({
    where: { proposalId: { in: [...proposalIds] }, isResolved: false },
  });
}
