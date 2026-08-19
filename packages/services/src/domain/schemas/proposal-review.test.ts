import { describe, expect, test } from 'bun:test';

import { ReviewThreadSchema, SubmitReviewInputSchema } from './proposal-review';

const validThread = {
  threadId: 't-1',
  proposalId: 'p-1',
  field: 'content',
  side: 'R',
  lineNumber: 3,
  lineSnapshot: 'a line',
  isResolved: false,
  createdAt: '2026-08-19T00:00:00Z',
};

const validSubmit = {
  proposalId: 'p-1',
  author: 'author-test',
  newThreads: [
    {
      proposalId: 'p-1',
      field: 'content',
      side: 'L',
      lineNumber: 2,
      lineSnapshot: 'old line',
      body: '请保留这段',
    },
  ],
};

describe('proposal review schemas', () => {
  test('accepts a valid review thread', () => {
    expect(ReviewThreadSchema.safeParse(validThread).success).toBe(true);
  });

  test('rejects a thread with an invalid line number', () => {
    expect(ReviewThreadSchema.safeParse({ ...validThread, lineNumber: 0 }).success).toBe(false);
  });

  test('rejects a thread with an invalid side', () => {
    expect(ReviewThreadSchema.safeParse({ ...validThread, side: 'X' }).success).toBe(false);
  });

  test('accepts a multi-line thread anchor', () => {
    expect(ReviewThreadSchema.safeParse({ ...validThread, lineCount: 3 }).success).toBe(true);
  });

  test('accepts a valid submit input', () => {
    expect(SubmitReviewInputSchema.safeParse(validSubmit).success).toBe(true);
  });

  test('accepts a submit input with an overall comment and no threads', () => {
    expect(
      SubmitReviewInputSchema.safeParse({ ...validSubmit, newThreads: [], overallComment: '整体意见' }).success,
    ).toBe(true);
  });
});
