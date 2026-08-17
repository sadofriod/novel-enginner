import { useEffect } from 'react';

const REFRESH_EVENT_TYPES = [
  'run.step.completed', 'run.step.failed', 'run.completed', 'run.aborted',
  'workspace.invalid', 'workspace.valid', 'derived.ready', 'derived.failed',
  'artifact.proposed', 'artifact.approved', 'artifact.override-approved',
  'artifact.rejected', 'artifact.exported', 'artifact.canonical-committed',
  'artifact.commit-blocked', 'artifact.review-stale',
];

/**
 * Opens the run SSE stream (proxied through `/api`) and calls `onEvent` whenever a
 * run/workspace/derived/artifact event arrives, so the console refreshes its RTK Query
 * cache without waiting for the polling interval. Replaces the old
 * `ApiClient.openRunStream` transport with a dependency-free `EventSource`.
 */
export function useRunEventStream(runId: string | undefined, onEvent: () => void): void {
  useEffect(() => {
    if (runId === undefined) {
      return;
    }
    const stream = new EventSource(`/api/runs/${runId}/stream`);
    const handler = (): void => {
      onEvent();
    };
    for (const eventType of REFRESH_EVENT_TYPES) {
      stream.addEventListener(eventType, handler);
    }
    return () => {
      for (const eventType of REFRESH_EVENT_TYPES) {
        stream.removeEventListener(eventType, handler);
      }
      stream.close();
    };
  }, [runId, onEvent]);
}
