import { buildWorkspaceTree } from '../../../../workspace/content';
import { getWorkspaceEntity } from '../../../../workspace/entity';
import { CANONICAL_ENTITY_KIND_VALUES } from '../../../../workspace/layout';
import { readCanonicalWorkspaceFiles } from '../../../../workspace/file-watcher';
import { jsonResponse } from '../../transport/http';

import type { CanonicalEntityKind } from '../../../../workspace/layout';
import type { RouteHandlerDeps } from './context';

export interface WorkspaceHandlers {
  readonly handleGetWorkspaceTree: () => Promise<Response>;
  readonly handleGetWorkspaceEntity: (kind: string, id: string) => Promise<Response>;
}

export function createWorkspaceHandlers(deps: RouteHandlerDeps): WorkspaceHandlers {
  const { options, logger } = deps;
  const readFiles = options.readCanonicalFiles ?? readCanonicalWorkspaceFiles;
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  async function handleGetWorkspaceTree(): Promise<Response> {
    logger.debug('Building workspace content tree');
    const files = await readFiles(workspaceRoot);
    const tree = buildWorkspaceTree(files);
    logger.info({ volumes: tree.volumes.length }, 'Workspace tree built');
    return jsonResponse(tree);
  }

  async function handleGetWorkspaceEntity(kind: string, id: string): Promise<Response> {
    logger.debug({ kind, id }, 'Fetching workspace entity');
    if (!(CANONICAL_ENTITY_KIND_VALUES as readonly string[]).includes(kind)) {
      logger.warn({ kind }, 'Unknown entity kind requested');
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: `Unknown entity kind "${kind}".` }, 400);
    }
    const files = await readFiles(workspaceRoot);
    const entity = getWorkspaceEntity(files, kind as CanonicalEntityKind, id);
    if (entity === undefined) {
      logger.warn({ kind, id }, 'Workspace entity not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: `Unknown ${kind} "${id}".` }, 404);
    }
    logger.debug({ kind, id }, 'Workspace entity retrieved');
    return jsonResponse(entity);
  }

  return { handleGetWorkspaceTree, handleGetWorkspaceEntity };
}
