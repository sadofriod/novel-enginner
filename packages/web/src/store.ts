import { configureStore } from '@reduxjs/toolkit';

import { controlApi } from './control-api';
import { decisionFeedbackSlice } from './decision-feedback';

export const store = configureStore({
  reducer: {
    [controlApi.reducerPath]: controlApi.reducer,
    decisionFeedback: decisionFeedbackSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(controlApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
