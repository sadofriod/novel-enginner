import { describe, expect, test } from 'bun:test';

import { decisionFeedbackSlice, recordFailure } from './decision-feedback';

describe('decisionFeedbackSlice', () => {
  test('starts with no recorded failure', () => {
    expect(decisionFeedbackSlice.getInitialState()).toEqual({ latest: undefined });
  });

  test('records the most recent run.step.failed reason', () => {
    let state = decisionFeedbackSlice.reducer(
      undefined,
      recordFailure({ runId: 'run-1', reason: 'review-rejected' }),
    );
    expect(state.latest).toEqual({ runId: 'run-1', reason: 'review-rejected' });

    state = decisionFeedbackSlice.reducer(
      state,
      recordFailure({ runId: 'run-2', reason: 'active proposal not found' }),
    );
    expect(state.latest).toEqual({ runId: 'run-2', reason: 'active proposal not found' });
  });
});
