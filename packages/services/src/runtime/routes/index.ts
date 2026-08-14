import { getAppRoute } from './app/get';
import { postAppCommandRoute } from './app/actions/command/post';
import { getArtifactsRoute } from './artifacts/get';
import { getArtifactRoute } from './artifacts/[artifactType]/[targetId]/get';
import { getOverrideAuditRoute } from './audits/override/[overrideAuditId]/get';
import { getBootstrapSessionEvidenceRoute } from './bootstrap-sessions/[sessionId]/evidence/get';
import { getBootstrapSessionRevisionsRoute } from './bootstrap-sessions/[sessionId]/revisions/get';
import { getBootstrapSessionRoute } from './bootstrap-sessions/[sessionId]/get';
import { getBootstrapSessionsRoute } from './bootstrap-sessions/get';
import { getCommandRoute } from './commands/[commandId]/get';
import { postCommandsRoute } from './commands/post';
import { getRootRoute } from './root/get';
import { getRunsRoute } from './runs/get';
import { getRunRoute } from './runs/[runId]/get';
import { getRunStreamRoute } from './runs/[runId]/stream/get';
import { postRebuildGraphRoute } from './sync/rebuild-graph/post';
import { postReSyncStateRoute } from './sync/re-sync-state/post';
import type { RuntimeRouteDefinition } from './types';

const ROUTES: readonly RuntimeRouteDefinition[] = [
  getRootRoute,
  getAppRoute,
  postAppCommandRoute,
  postCommandsRoute,
  getCommandRoute,
  getRunsRoute,
  getRunRoute,
  getRunStreamRoute,
  getArtifactsRoute,
  getArtifactRoute,
  getOverrideAuditRoute,
  getBootstrapSessionsRoute,
  getBootstrapSessionRoute,
  getBootstrapSessionRevisionsRoute,
  getBootstrapSessionEvidenceRoute,
  postRebuildGraphRoute,
  postReSyncStateRoute,
];

export function listRegisteredRoutes(): readonly RuntimeRouteDefinition[] {
  return ROUTES;
}
