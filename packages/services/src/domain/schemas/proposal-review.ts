import { z } from 'zod';

import { REVIEW_DISPOSITION_VALUES, THREAD_SIDE_VALUES } from '../values';

import { NonEmptyStringSchema, PositiveIntegerSchema, StableIdSchema } from './common';

/** A draft comment referencing an existing thread (a reply at submit time). */
export const ReviewCommentDraftSchema = z
  .object({
    threadId: StableIdSchema,
    body: NonEmptyStringSchema,
  })
  .readonly();

/** A brand-new inline thread with its first comment, created at submit time. */
export const NewReviewThreadSchema = z
  .object({
    proposalId: StableIdSchema,
    field: NonEmptyStringSchema,
    side: z.enum(THREAD_SIDE_VALUES),
    lineNumber: PositiveIntegerSchema,
    /** Anchor line count (≥1); a multi-line comment range when > 1. */
    lineCount: PositiveIntegerSchema.optional(),
    lineSnapshot: z.string(),
    body: NonEmptyStringSchema,
  })
  .readonly();

export const ReviewCommentSchema = z
  .object({
    commentId: StableIdSchema,
    threadId: StableIdSchema,
    author: StableIdSchema,
    body: NonEmptyStringSchema,
    createdAt: NonEmptyStringSchema,
  })
  .readonly();

export const ReviewThreadSchema = z
  .object({
    threadId: StableIdSchema,
    proposalId: StableIdSchema,
    field: NonEmptyStringSchema,
    side: z.enum(THREAD_SIDE_VALUES),
    lineNumber: PositiveIntegerSchema,
    /** Anchor line count (≥1); a multi-line comment range when > 1. */
    lineCount: PositiveIntegerSchema.optional(),
    lineSnapshot: z.string(),
    isResolved: z.boolean(),
    resolvedBy: StableIdSchema.optional(),
    resolvedAt: NonEmptyStringSchema.optional(),
    createdAt: NonEmptyStringSchema,
  })
  .readonly();

export const ProposalReviewSchema = z
  .object({
    reviewId: StableIdSchema,
    proposalId: StableIdSchema,
    disposition: z.enum(REVIEW_DISPOSITION_VALUES),
    overallComment: NonEmptyStringSchema.optional(),
    submittedAt: NonEmptyStringSchema,
  })
  .readonly();

/**
 * Input for the `submit-review` command: the reviewer's overall comment plus the
 * batch of drafted inline comments (new threads and/or replies) to commit atomically.
 */
export const SubmitReviewInputSchema = z
  .object({
    proposalId: StableIdSchema,
    author: StableIdSchema,
    overallComment: NonEmptyStringSchema.optional(),
    newThreads: z.array(NewReviewThreadSchema).readonly(),
    replies: z.array(ReviewCommentDraftSchema).readonly().default([]),
  })
  .readonly();
