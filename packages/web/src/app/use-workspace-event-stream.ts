import { useEffect } from 'react';

import { recordFailure } from '../decision-feedback';
import { controlApi } from '../control-api';
import { store } from '../store';
import { createWorkspaceStreamConnector } from './workspace-stream';

const REFRESH_TAGS = ['Artifact', 'Run', 'BootstrapSession', 'BootstrapConfig', 'Command', 'Workspace'] as const;

/**
 * Opens a single workspace-level WebSocket and refreshes the RTK Query cache on
 * every pushed event, capturing `run.step.failed` reasons so the approval panel can
 * surface real decision outcomes (e.g. a rejected review) instead of leaving the
 * author with only a 202 "accepted" frame. Replaces the old per-run SSE polling
 * described in docs/current-state/07-web-console.md.
 */
export function useWorkspaceEventStream(baseUrl: string = window.location.href): void {
  useEffect(() => {
    const connector = createWorkspaceStreamConnector({
      baseUrl,
      createSocket: (url) => new WebSocket(url),
      onEvent: (frame) => {
        store.dispatch(controlApi.util.invalidateTags([...REFRESH_TAGS]));
        if (frame.type === 'run.step.failed' && typeof frame.data?.['reason'] === 'string') {
          store.dispatch(recordFailure({ runId: frame.runId, reason: frame.data['reason'] }));
        }
      },
    });
    connector.start();
    return () => connector.stop();
  }, [baseUrl]);
}
