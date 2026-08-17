import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { serve as serveInngest } from 'inngest/bun';

import { createApiServer } from './api-server';
import { createChildLogger } from '../common/logger';
import { seedWebConsoleFixture } from './seed-web-fixtures';
import { createWorkspaceEventRelay } from './ws-relay';
import { readCanonicalWorkspaceFiles, startWorkspaceFileWatcher } from '../workspace/file-watcher';
import { inngest, inngestFunctions } from '../workflow';
import { coordinateWorkspaceSync } from './workspace-sync-coordinator';
import { validateCapabilityStartup } from './capability-startup';

import type { WorkspaceEventRelay } from './ws-relay';

const logger = createChildLogger('server');

const port = Number.parseInt(process.env['SERVICE_PORT'] ?? process.env['PORT'] ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  const errorMsg = 'PORT must be an integer between 1 and 65535.';
  logger.error({ port }, errorMsg);
  throw new Error(errorMsg);
}

const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
logger.info({ workspaceRoot }, 'Loading workspace configuration');

const registryMarkdown = readFileSync(join(workspaceRoot, 'state/capabilities/registry.md'), 'utf8');
const mcpConfig = JSON.parse(readFileSync(join(workspaceRoot, 'mcp.json'), 'utf8')) as { readonly servers?: Record<string, unknown> };
logger.debug('Validating capability startup');
validateCapabilityStartup(registryMarkdown, mcpConfig, workspaceRoot);
logger.info('Capability validation successful');

const apiServer = createApiServer({ workspaceRoot });
logger.info('API server created');
const inngestBaseUrl = process.env['INNGEST_BASE_URL']?.trim();
const inngestSigningKey = process.env['INNGEST_SIGNING_KEY']?.trim();
logger.info(
  { inngestConfigured: inngestBaseUrl !== undefined && inngestBaseUrl !== '' },
  'Initializing Inngest workflow handler',
);
const inngestHandler = serveInngest({
  client: inngest,
  functions: inngestFunctions,
  ...(inngestBaseUrl === undefined || inngestBaseUrl === '' ? {} : { baseUrl: inngestBaseUrl }),
  ...(inngestSigningKey === undefined || inngestSigningKey === '' ? {} : { signingKey: inngestSigningKey }),
});
logger.debug('Inngest handler initialized');

if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
  logger.info('Database connection detected, scheduling cleanup tasks');
  const cleanupBootstrapSessions = async (): Promise<void> => {
    try {
      logger.debug('Starting bootstrap session cleanup');
      const { deleteExpiredAbandonedBootstrapSessions } = await import('../bootstrap/repositories/prisma-session-repository');
      const deletedCount = await deleteExpiredAbandonedBootstrapSessions();
      logger.info({ deletedCount }, 'Bootstrap session cleanup completed');
    } catch (cause) {
      logger.error(
        {
          error: cause instanceof Error ? cause.message : String(cause),
        },
        'Bootstrap session cleanup failed',
      );
    }
  };
  void cleanupBootstrapSessions();
  setInterval(() => { void cleanupBootstrapSessions(); }, 24 * 60 * 60 * 1000).unref();
} else {
  logger.info('Database not configured or running in test mode, skipping cleanup tasks');
}

const workspaceId = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';
logger.info({ workspaceId }, 'Starting workspace file watcher');

const workspaceWatcher = startWorkspaceFileWatcher({
  workspaceRoot: process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd(),
  session: apiServer.store.getOrCreateSyncSession(workspaceId),
  syncOnStart: true,
  onSync: async (state) => {
    logger.debug({ snapshotId: state.snapshot.snapshotId }, 'Workspace sync triggered');
    const files = await readCanonicalWorkspaceFiles(workspaceRoot);
    logger.debug({ fileCount: files.length }, 'Read workspace files');
    
    await coordinateWorkspaceSync({
      store: apiServer.store,
      eventBus: apiServer.eventBus,
      workspaceId,
      bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
      session: apiServer.store.getOrCreateSyncSession(workspaceId),
      state,
      files,
      getActiveRuns: () => apiServer.store.listActiveWriteRuns(),
      onDerivedRebuild: async ({ workspaceId: derivedWorkspaceId, bookId: derivedBookId, snapshot }) => {
        if (process.env['DATABASE_URL'] === undefined) {
          logger.debug('Skipping derived rebuild: database not configured');
          return;
        }
        const jobId = `watcher-derived-${snapshot.snapshotId}`;
        logger.info({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId }, 'Starting derived search index rebuild');
        const { persistDerivedRebuildJob } = await import('../persistence/operations');
        await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'running', triggeredBy: 'watcher-sync' });
        try {
          const { rebuildDerivedSearchIndex } = await import('../graph/embedding-dispatch');
          await rebuildDerivedSearchIndex(snapshot, { workspaceId: derivedWorkspaceId, bookId: derivedBookId });
          logger.info({ jobId }, 'Derived search index rebuild completed successfully');
          await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'completed' });
        } catch (cause) {
          const errorMessage = cause instanceof Error ? cause.message : String(cause);
          logger.error({ jobId, error: errorMessage }, 'Derived search index rebuild failed');
          await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'failed', errorReason: errorMessage });
          throw cause;
        }
      },
      onSyntheticCommit: async (syntheticCommit) => {
        if (process.env['DATABASE_URL'] === undefined) {
          logger.debug('Skipping synthetic commit: database not configured');
          return;
        }
        logger.info({ commitId: syntheticCommit.commitId, pathCount: syntheticCommit.changedPaths.length }, 'Persisting synthetic commit');
        const { persistSyntheticCommit } = await import('../persistence/operations');
        await persistSyntheticCommit({
          syntheticCommitId: syntheticCommit.commitId,
          workspaceId,
          bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
          targetFilePaths: syntheticCommit.changedPaths,
          canonicalVersion: syntheticCommit.snapshotId,
          message: 'Automatic workspace re-sync',
        });
        logger.debug({ commitId: syntheticCommit.commitId }, 'Synthetic commit persisted');
      },
    });
  },
});
logger.info('Workspace file watcher started');

if (process.env['NOVEL_E2E_FIXTURE'] === '1') {
  logger.info('Loading E2E test fixtures');
  seedWebConsoleFixture(apiServer.store);
  logger.info('E2E test fixtures loaded');
}

interface WsRelayData {
  relay?: WorkspaceEventRelay;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _server = Bun.serve<WsRelayData>({
  port,
  idleTimeout: 0,
  fetch: (request, server) => {
    const url = new URL(request.url);
    if (url.pathname === '/ws' && request.headers.get('upgrade') === 'websocket') {
      if (server.upgrade(request, { data: {} })) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    const pathname = url.pathname;
    return pathname === '/api/inngest' ? inngestHandler(request) : apiServer.fetch(request);
  },
  websocket: {
    open(ws) {
      logger.info('Workspace WebSocket connected');
      const relay = createWorkspaceEventRelay({
        eventBus: apiServer.eventBus,
        send: (frame) => ws.send(frame),
      });
      ws.data.relay = relay;
    },
    close(ws) {
      ws.data.relay?.close();
      logger.info('Workspace WebSocket disconnected');
    },
    message() {
      // Workspace events are server-pushed only.
    },
  },
});

logger.info(
  { url: `http://localhost:${port}`, environment: process.env['NODE_ENV'] ?? 'development' },
  'Novel Enginner API server started',
);
logger.info({ workspaceRoot }, 'Watching canonical workspace');
logger.info({ workspaceId }, 'Workspace synchronization active');

void workspaceWatcher;