import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DecisionFailure {
  readonly runId: string;
  readonly reason: string;
}

export interface DecisionFeedbackState {
  readonly latest: DecisionFailure | undefined;
}

const initialState: DecisionFeedbackState = { latest: undefined };

/**
 * Captures the most recent `run.step.failed` event delivered over the workspace
 * WebSocket, so the approval panel can surface the real decision outcome (e.g. a
 * rejected review) instead of leaving the author with only a 202 "accepted" frame.
 */
export const decisionFeedbackSlice = createSlice({
  name: 'decisionFeedback',
  initialState,
  reducers: {
    recordFailure(state, action: PayloadAction<DecisionFailure>) {
      state.latest = action.payload;
    },
  },
});

export const { recordFailure } = decisionFeedbackSlice.actions;
