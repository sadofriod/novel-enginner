import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface ArtifactHandlers {
  readonly handleListArtifacts: () => Response;
  readonly handleGetArtifact: (artifactType: string, targetId: string) => Response;
}

export function createArtifactHandlers(deps: RouteHandlerDeps): ArtifactHandlers {
  const { store, logger } = deps;

  function handleListArtifacts(): Response {
    logger.debug('Listing artifacts');
    const artifacts = store.listArtifacts();
    logger.info({ count: artifacts.length }, 'Artifacts listed');
    return jsonResponse(artifacts);
  }

  function handleGetArtifact(artifactType: string, targetId: string): Response {
    logger.debug({ artifactType, targetId }, 'Fetching artifact');
    const artifact = store.getArtifact(artifactType, targetId);
    if (artifact === undefined) {
      logger.warn({ artifactType, targetId }, 'Artifact not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown artifact.' }, 404);
    }
    logger.debug({ artifactType, targetId }, 'Artifact retrieved successfully');
    return jsonResponse(artifact);
  }

  return { handleListArtifacts, handleGetArtifact };
}
