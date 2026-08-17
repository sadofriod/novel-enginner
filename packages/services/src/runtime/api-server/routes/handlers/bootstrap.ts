/* eslint-disable complexity, max-lines-per-function */
import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface BootstrapHandlers {
  readonly handleGetBootstrapConfig: () => Response;
  readonly handleListBootstrapSessions: () => Promise<Response>;
  readonly handleGetBootstrapSession: (sessionId: string) => Promise<Response>;
  readonly handleGetBootstrapSessionRevisions: (sessionId: string) => Promise<Response>;
  readonly handleGetBootstrapSessionEvidence: (sessionId: string) => Promise<Response>;
}

export function createBootstrapHandlers(deps: RouteHandlerDeps): BootstrapHandlers {
  const { store, logger, options } = deps;

  function handleGetBootstrapConfig(): Response {
    logger.debug('Fetching bootstrap config');
    const config = {
      workspaceId: process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local',
      bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
      workspaceRoot: options.workspaceRoot ?? process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd(),
    };
    logger.info({ workspaceId: config.workspaceId, bookId: config.bookId }, 'Bootstrap config retrieved');
    return jsonResponse(config);
  }

  async function handleListBootstrapSessions(): Promise<Response> {
    logger.debug('Listing bootstrap sessions');
    if (store.listBootstrapSessions().length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug('No in-memory bootstrap sessions, loading from database');
      const { listPersistedBootstrapSessions } = await import('../../../../bootstrap/repositories/prisma-session-repository');
      const persistedSessions = await listPersistedBootstrapSessions();
      logger.debug({ count: persistedSessions.length }, 'Persisted bootstrap sessions loaded');
      for (const session of persistedSessions) store.upsertBootstrapSession(session);
    }
    const sessions = store.listBootstrapSessions();
    logger.info({ count: sessions.length }, 'Bootstrap sessions listed');
    return jsonResponse(sessions);
  }

  async function handleGetBootstrapSession(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session');
    let session = store.getBootstrapSession(sessionId);
    if (session === undefined && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'Session not in memory, checking database');
      const { findPersistedBootstrapSession } = await import('../../../../bootstrap/repositories/prisma-session-repository');
      session = await findPersistedBootstrapSession(sessionId);
      if (session !== undefined) {
        store.upsertBootstrapSession(session);
        logger.debug({ sessionId }, 'Session loaded from database');
      }
    }
    if (session === undefined) {
      logger.warn({ sessionId }, 'Bootstrap session not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: `Unknown bootstrap session "${sessionId}".` }, 404);
    }
    logger.info({ sessionId }, 'Bootstrap session retrieved');
    return jsonResponse(session);
  }

  async function handleGetBootstrapSessionRevisions(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session revisions');
    if (store.listBootstrapRevisions(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'No revisions in memory, loading from database');
      const { listPersistedBootstrapRevisions } = await import('../../../../bootstrap/repositories/prisma-session-repository');
      const persistedRevisions = await listPersistedBootstrapRevisions(sessionId);
      logger.debug({ sessionId, count: persistedRevisions.length }, 'Persisted revisions loaded');
      for (const revision of persistedRevisions) store.upsertBootstrapRevision(revision);
    }
    const revisions = store.listBootstrapRevisions(sessionId);
    logger.info({ sessionId, count: revisions.length }, 'Bootstrap revisions retrieved');
    return jsonResponse(revisions);
  }

  async function handleGetBootstrapSessionEvidence(sessionId: string): Promise<Response> {
    logger.debug({ sessionId }, 'Fetching bootstrap session evidence');
    if (store.listBootstrapEvidence(sessionId).length === 0 && process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
      logger.debug({ sessionId }, 'No evidence in memory, loading from database');
      const { listPersistedBootstrapEvidence } = await import('../../../../bootstrap/repositories/prisma-session-repository');
      const persistedEvidence = await listPersistedBootstrapEvidence(sessionId);
      logger.debug({ sessionId, count: persistedEvidence.length }, 'Persisted evidence loaded');
      for (const item of persistedEvidence) store.upsertBootstrapEvidence(item);
    }
    const evidence = store.listBootstrapEvidence(sessionId);
    logger.info({ sessionId, count: evidence.length }, 'Bootstrap evidence retrieved');
    return jsonResponse(evidence);
  }

  return {
    handleGetBootstrapConfig,
    handleListBootstrapSessions,
    handleGetBootstrapSession,
    handleGetBootstrapSessionRevisions,
    handleGetBootstrapSessionEvidence,
  };
}
