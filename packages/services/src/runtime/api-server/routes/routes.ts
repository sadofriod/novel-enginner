/* eslint-disable max-lines-per-function */

/**
 * API server route composition. Assembles the domain-grouped route handlers
 * (routes/handlers/*) into the `RouteApi` consumed by the route table and
 * provides the request dispatch middleware.
 */
import { createChildLogger } from '../../../common/logger';
import { listRegisteredRoutes } from '../../routes';
import { matchRoute } from '../../routes/match-route';
import type { RouteApi } from '../../routes/types';
import type { RunEventBus } from '../../event-bus';
import type { RuntimeStore } from '../../store';
import { jsonResponse } from '../transport/http';
import type { CreateApiServerOptions } from '../types';

import { createArtifactHandlers } from './handlers/artifacts';
import { createBootstrapHandlers } from './handlers/bootstrap';
import { createCommandHandlers } from './handlers/commands';
import type { RouteHandlerDeps } from './handlers/context';
import { createOverrideAuditHandlers } from './handlers/override-audits';
import { createRedirectHandlers } from './handlers/redirects';
import { createRunHandlers } from './handlers/runs';
import { createSyntheticReviewHandlers } from './handlers/synthetic-reviews';
import { createSyncHandlers } from './handlers/sync';
import { createWebCommandHandlers } from './handlers/web-commands';
import { createWorkspaceHandlers } from './handlers/workspace';
import { createGraphHandlers } from './handlers/graph';
import { createSearchHandlers } from './handlers/search';

export function createApiServerRoutes(
  options: CreateApiServerOptions,
  store: RuntimeStore,
  eventBus: RunEventBus,
): { readonly fetch: (request: Request) => Promise<Response> } {
  const logger = createChildLogger('routes');
  const getWorkspaceValidity = options.getWorkspaceValidity ?? ((workspaceId: string) => store.getWorkspaceValidity(workspaceId));

  const deps: RouteHandlerDeps = {
    options,
    store,
    eventBus,
    logger,
    getWorkspaceValidity,
    persistAcceptedCommand: options.persistAcceptedCommand,
    loadPersistedCommand: options.loadPersistedCommand,
    dispatchCommand: options.dispatchCommand,
    dispatchSyntheticReview: options.dispatchSyntheticReview,
    reSyncStateOptions: options.reSyncStateOptions ?? { getActiveRuns: () => [] },
  };

  const redirectHandlers = createRedirectHandlers(deps);
  const commandHandlers = createCommandHandlers(deps);
  const runHandlers = createRunHandlers(deps);
  const artifactHandlers = createArtifactHandlers(deps);
  const bootstrapHandlers = createBootstrapHandlers(deps);
  const overrideAuditHandlers = createOverrideAuditHandlers(deps);
  const syncHandlers = createSyncHandlers(deps);
  const syntheticReviewHandlers = createSyntheticReviewHandlers(deps);
  const webCommandHandlers = createWebCommandHandlers(deps, {
    handlePostCommand: commandHandlers.handlePostCommand,
    handleSyncCommand: syncHandlers.handleSyncCommand,
  });
  const workspaceHandlers = createWorkspaceHandlers(deps);
  const graphHandlers = createGraphHandlers(deps);
  const searchHandlers = createSearchHandlers(deps);

  const api: RouteApi = {
    handleRoot: redirectHandlers.handleRoot,
    handleApp: redirectHandlers.handleApp,
    handleWebCommandAction: webCommandHandlers.handleWebCommandAction,
    handleWebSystemCommand: webCommandHandlers.handleWebSystemCommand,
    handlePostCommand: commandHandlers.handlePostCommand,
    handleGetCommand: commandHandlers.handleGetCommand,
    handleListRuns: runHandlers.handleListRuns,
    handleListArtifacts: artifactHandlers.handleListArtifacts,
    handleListBootstrapSessions: bootstrapHandlers.handleListBootstrapSessions,
    handleGetBootstrapConfig: bootstrapHandlers.handleGetBootstrapConfig,
    handleGetBootstrapSession: bootstrapHandlers.handleGetBootstrapSession,
    handleGetBootstrapSessionRevisions: bootstrapHandlers.handleGetBootstrapSessionRevisions,
    handleGetBootstrapSessionEvidence: bootstrapHandlers.handleGetBootstrapSessionEvidence,
    handleGetRun: runHandlers.handleGetRun,
    handleGetArtifact: artifactHandlers.handleGetArtifact,
    handleGetOverrideAudit: overrideAuditHandlers.handleGetOverrideAudit,
    handleGetWorkspaceTree: workspaceHandlers.handleGetWorkspaceTree,
    handleGetWorkspaceEntity: workspaceHandlers.handleGetWorkspaceEntity,
    handleGetGraph: graphHandlers.handleGetGraph,
    handleSearch: searchHandlers.handleSearch,
    handleSyncCommand: syncHandlers.handleSyncCommand,
    handleSyntheticReviewOutcome: syntheticReviewHandlers.handleSyntheticReviewOutcome,
  };

  const routes = listRegisteredRoutes();

  async function fetch(request: Request): Promise<Response> {
    const startTime = performance.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    try {
      logger.debug({ method, pathname }, 'Incoming HTTP request');

      const matched = matchRoute(routes, method, pathname);

      if (matched === undefined) {
        const duration = performance.now() - startTime;
        logger.warn({ method, pathname, duration: duration.toFixed(2) }, 'Route not found');
        return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown route.' }, 404);
      }

      const response = await matched.route.handle({ api, request, url, params: matched.params });
      const duration = performance.now() - startTime;
      const status = response.status;

      logger.info({ method, pathname, status, duration: duration.toFixed(2) }, 'HTTP request completed');
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error({
        method,
        pathname,
        duration: duration.toFixed(2),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, 'HTTP request failed');
      return jsonResponse({ status: 'rejected', code: 'internal-error', message: 'Internal server error' }, 500);
    }
  }

  return { fetch };
}
