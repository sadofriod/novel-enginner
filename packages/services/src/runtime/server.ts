import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { serve as serveInngest } from 'inngest/bun';

import { createApiServer } from './api-server';
import { seedWebConsoleFixture } from './seed-web-fixtures';
import { readCanonicalWorkspaceFiles, startWorkspaceFileWatcher } from '../workspace/file-watcher';
import { inngest, inngestFunctions } from '../workflow';
import { coordinateWorkspaceSync } from './workspace-sync-coordinator';
import { validateCapabilityStartup } from './capability-startup';

const port = Number.parseInt(process.env['SERVICE_PORT'] ?? process.env['PORT'] ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
const registryMarkdown = readFileSync(join(workspaceRoot, 'state/capabilities/registry.md'), 'utf8');
const mcpConfig = JSON.parse(readFileSync(join(workspaceRoot, 'mcp.json'), 'utf8')) as { readonly servers?: Record<string, unknown> };
validateCapabilityStartup(registryMarkdown, mcpConfig, workspaceRoot);
const apiServer = createApiServer({ workspaceRoot });
const inngestHandler = serveInngest({ client: inngest, functions: inngestFunctions });

if (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test') {
  const cleanupBootstrapSessions = async (): Promise<void> => {
    const { deleteExpiredAbandonedBootstrapSessions } = await import('../bootstrap/repositories/prisma-session-repository');
    await deleteExpiredAbandonedBootstrapSessions();
  };
  void cleanupBootstrapSessions();
  setInterval(() => { void cleanupBootstrapSessions(); }, 24 * 60 * 60 * 1000).unref();
}

const workspaceId = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';
const workspaceWatcher = startWorkspaceFileWatcher({
  workspaceRoot: process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd(),
  session: apiServer.store.getOrCreateSyncSession(workspaceId),
  syncOnStart: true,
  onSync: async (state) => {
    const files = await readCanonicalWorkspaceFiles(workspaceRoot);
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
          return;
        }
        const jobId = `watcher-derived-${snapshot.snapshotId}`;
        const { persistDerivedRebuildJob } = await import('../persistence/operations');
        await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'running', triggeredBy: 'watcher-sync' });
        try {
          const { rebuildDerivedSearchIndex } = await import('../graph/embedding-dispatch');
          await rebuildDerivedSearchIndex(snapshot, { workspaceId: derivedWorkspaceId, bookId: derivedBookId });
          await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'completed' });
        } catch (cause) {
          await persistDerivedRebuildJob({ jobId, workspaceId: derivedWorkspaceId, bookId: derivedBookId, jobType: 'graph-search-embedding', status: 'failed', errorReason: cause instanceof Error ? cause.message : String(cause) });
          throw cause;
        }
      },
      onSyntheticCommit: async (syntheticCommit) => {
        if (process.env['DATABASE_URL'] === undefined) {
          return;
        }
        const { persistSyntheticCommit } = await import('../persistence/operations');
        await persistSyntheticCommit({
          syntheticCommitId: syntheticCommit.commitId,
          workspaceId,
          bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
          targetFilePaths: syntheticCommit.changedPaths,
          canonicalVersion: syntheticCommit.snapshotId,
          message: 'Automatic workspace re-sync',
        });
      },
    });
  },
});

if (process.env['NOVEL_E2E_FIXTURE'] === '1') {
  seedWebConsoleFixture(apiServer.store);
}

Bun.serve({
  port,
  idleTimeout: 0,
  fetch: (request) => {
    const pathname = new URL(request.url).pathname;
    return pathname === '/api/inngest' ? inngestHandler(request) : apiServer.fetch(request);
  },
});

console.log(`Novel Enginner API listening on http://localhost:${port}`);
console.log(`Watching canonical workspace at ${workspaceRoot}`);

void workspaceWatcher;