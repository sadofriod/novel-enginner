import type { RuntimeRouteDefinition } from '../../types';

/** Callback target for the async synthetic-review function (§5.8): records the re-review outcome. */
export const postSyntheticReviewOutcomeRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/review/synthetic-outcome',
  handle: ({ api, request }) => api.handleSyntheticReviewOutcome(request),
};
