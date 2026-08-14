/* eslint-disable complexity */

import { serve as serveInngest } from 'inngest/bun';

import { handleHandEditedArtifact } from '../agent/synthetic-review';
import { createApiServer } from './api-server';
import { seedWebConsoleFixture } from './seed-web-fixtures';
import { readCanonicalWorkspaceFiles, startWorkspaceFileWatcher } from '../workspace/file-watcher';
import { inngest, inngestFunctions } from '../workflow';

const port = Number.parseInt(process.env['SERVICE_PORT'] ?? process.env['PORT'] ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const apiServer = createApiServer();
const inngestHandler = serveInngest({ client: inngest, functions: inngestFunctions });
const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
const proposalArtifactTypeByCanonicalKind: Readonly<Record<string, string>> = {
  character: 'character-update',
  faction: 'faction-update',
  location: 'location-update',
  'tech-rule': 'tech-rule-update',
  fact: 'fact-update',
  relationship: 'relationship-update',
  resource: 'resource-update',
};

const workspaceId = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';
const workspaceWatcher = startWorkspaceFileWatcher({
  workspaceRoot: process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd(),
  session: apiServer.store.getOrCreateSyncSession(workspaceId),
  syncOnStart: true,
  onSync: async (state) => {
    apiServer.store.setLastKnownSnapshot(workspaceId, state.snapshot);
    apiServer.store.setWorkspaceValidity(workspaceId, state.validity);
    const files = await readCanonicalWorkspaceFiles(workspaceRoot);
    const contentByPath = new Map(files.map((file) => [file.path, file.content]));
    await Promise.all(state.changedPaths.map(async (path) => {
      const entity = state.snapshot.entities.get(path);
      const artifactType = entity === undefined ? undefined : proposalArtifactTypeByCanonicalKind[entity.kind];
      const targetId = entity === undefined ? undefined : (entity.data as { id?: unknown }).id;
      if (artifactType === undefined || typeof targetId !== 'string') {
        return;
      }
      const artifact = apiServer.store.getArtifact(artifactType, targetId);
      const wasApprovedBeforeEdit = artifact?.proposalStatus === 'approved' || artifact?.proposalStatus === 'override-approved';
      const editedText = contentByPath.get(path);
      const freshness = await handleHandEditedArtifact({
        workspaceId,
        bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
        artifactType,
        targetId,
        filePath: path,
        wasApprovedBeforeEdit,
        ...(editedText !== undefined ? { editedText } : {}),
        ...(artifact?.activeProposalId !== undefined ? { proposalId: artifact.activeProposalId } : {}),
      }, process.env['INNGEST_EVENT_KEY'] === undefined ? undefined : async (event) => {
        const { dispatchSyntheticReviewToInngest } = await import('../workflow/inngest-client');
        await dispatchSyntheticReviewToInngest(event.data);
      });
      if (freshness.stale && artifact !== undefined) {
        apiServer.store.upsertArtifact({
          ...artifact,
          reviewStale: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }));
    const syntheticCommit = apiServer.store.getOrCreateSyncSession(workspaceId).commitSyntheticSession();
    if (syntheticCommit !== undefined && process.env['DATABASE_URL'] !== undefined) {
      const { persistSyntheticCommit } = await import('../persistence/operations');
      await persistSyntheticCommit({
        syntheticCommitId: syntheticCommit.commitId,
        workspaceId,
        bookId: process.env['NOVEL_BOOK_ID'] ?? 'book-local',
        targetFilePaths: syntheticCommit.changedPaths,
        canonicalVersion: syntheticCommit.snapshotId,
        message: 'Automatic workspace re-sync',
      });
    }
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