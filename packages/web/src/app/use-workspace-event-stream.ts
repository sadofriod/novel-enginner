import { useEffect } from 'react';

import { controlApi } from '../control-api';
import { store } from '../store';
import { createWorkspaceStreamConnector } from './workspace-stream';

const REFRESH_TAGS = ['Artifact', 'Run', 'BootstrapSession', 'BootstrapConfig', 'Command', 'Workspace'] as const;

/**
 * Opens a single workspace-level WebSocket and refreshes the RTK Query cache on
 * every pushed event. Replaces the old per-run SSE polling described in
 * docs/current-state/07-web-console.md.
 */
export function useWorkspaceEventStream(baseUrl: string = window.location.href): void {
  useEffect(() => {
    const connector = createWorkspaceStreamConnector({
      baseUrl,
      createSocket: (url) => new WebSocket(url),
      onEvent: () => {
        store.dispatch(controlApi.util.invalidateTags([...REFRESH_TAGS]));
      },
    });
    connector.start();
    return () => connector.stop();
  }, [baseUrl]);
}
