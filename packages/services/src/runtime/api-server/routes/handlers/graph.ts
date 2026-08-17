import { buildDerivedGraph } from '../../../../graph';
import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface GraphHandlers {
  readonly handleGetGraph: () => Response;
}

export function createGraphHandlers(deps: RouteHandlerDeps): GraphHandlers {
  const { store, logger } = deps;
  const workspaceId = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';

  function handleGetGraph(): Response {
    logger.debug('Building workspace derived graph');
    const snapshot = store.getLastKnownSnapshot(workspaceId);
    if (snapshot === undefined) {
      logger.warn({ workspaceId }, 'No known snapshot for graph');
      return jsonResponse({ status: 'not-ready', nodes: [], edges: [] });
    }
    const graph = buildDerivedGraph(snapshot);
    logger.info({ nodes: graph.nodes.length, edges: graph.edges.length }, 'Derived graph built');
    return jsonResponse({
      status: 'ready',
      builtFromSnapshotId: snapshot.snapshotId,
      nodes: graph.nodes,
      edges: graph.edges,
    });
  }

  return { handleGetGraph };
}
