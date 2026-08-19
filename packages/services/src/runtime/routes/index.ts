import { getAppRoute } from './app/get';
import { postAppCommandRoute } from './app/actions/command/post';
import { postAppSystemCommandRoute } from './app/actions/system-command/post';
import { getArtifactsRoute } from './artifacts/get';
import { getArtifactRoute } from './artifacts/[artifactType]/[targetId]/get';
import { getOverrideAuditRoute } from './audits/override/[overrideAuditId]/get';
import { getBootstrapSessionEvidenceRoute } from './bootstrap-sessions/[sessionId]/evidence/get';
import { getBootstrapSessionRevisionsRoute } from './bootstrap-sessions/[sessionId]/revisions/get';
import { getBootstrapSessionRoute } from './bootstrap-sessions/[sessionId]/get';
import { getBootstrapSessionsRoute } from './bootstrap-sessions/get';
import { getBootstrapConfigRoute } from './bootstrap-config/get';
import { getCommandRoute } from './commands/[commandId]/get';
import { postCommandsRoute } from './commands/post';
import { getRootRoute } from './root/get';
import { getRunsRoute } from './runs/get';
import { getRunRoute } from './runs/[runId]/get';
import { getWorkspaceTreeRoute } from './workspace/tree/get';
import { getWorkspaceEntityRoute } from './workspace/entity/[kind]/[id]/get';
import { getGraphRoute } from './graph/get';
import { getSearchRoute } from './search/get';
import { postRebuildGraphRoute } from './sync/rebuild-graph/post';
import { postReSyncStateRoute } from './sync/re-sync-state/post';
import { postSyntheticReviewOutcomeRoute } from './review/synthetic-outcome/post';
import { getProposalThreadsRoute } from './proposals/[proposalId]/threads/get';
import { postProposalThreadsRoute } from './proposals/[proposalId]/threads/post';
import { getProposalChainRoute } from './proposals/[proposalId]/chain/get';
import { postThreadCommentsRoute } from './threads/[threadId]/comments/post';
import { postThreadResolveRoute } from './threads/[threadId]/resolve/post';
import { postThreadUnresolveRoute } from './threads/[threadId]/unresolve/post';
import { patchCommentRoute } from './comments/[commentId]/patch';
import { deleteCommentRoute } from './comments/[commentId]/delete';
import type { RuntimeRouteDefinition } from './types';

const ROUTES: readonly RuntimeRouteDefinition[] = [
  getRootRoute,
  getAppRoute,
  postAppCommandRoute,
  postAppSystemCommandRoute,
  postCommandsRoute,
  getCommandRoute,
  getRunsRoute,
  getRunRoute,
  getArtifactsRoute,
  getArtifactRoute,
  getOverrideAuditRoute,
  getBootstrapConfigRoute,
  getBootstrapSessionsRoute,
  getBootstrapSessionRoute,
  getBootstrapSessionRevisionsRoute,
  getBootstrapSessionEvidenceRoute,
  getWorkspaceTreeRoute,
  getWorkspaceEntityRoute,
  getGraphRoute,
  getSearchRoute,
  postRebuildGraphRoute,
  postReSyncStateRoute,
  postSyntheticReviewOutcomeRoute,
  getProposalThreadsRoute,
  postProposalThreadsRoute,
  getProposalChainRoute,
  postThreadCommentsRoute,
  postThreadResolveRoute,
  postThreadUnresolveRoute,
  patchCommentRoute,
  deleteCommentRoute,
];

export function listRegisteredRoutes(): readonly RuntimeRouteDefinition[] {
  return ROUTES;
}
