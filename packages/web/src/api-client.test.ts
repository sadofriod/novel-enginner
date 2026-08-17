import { describe, expect, test } from 'bun:test';

import { ApiClient } from './api-client';

describe('ApiClient runtime resources', () => {
  test('uses the dedicated endpoints for command, run, artifact, audit, and sync resources', async () => {
    const requests: Array<{ readonly url: string; readonly method: string }> = [];
    const client = new ApiClient({
      baseUrl: '/api',
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push({ url, method: init?.method ?? 'GET' });
        if (url.endsWith('/artifacts/chapter-outline/chapter-0001-outline')) {
          return Response.json({ artifactType: 'chapter-outline', targetId: 'chapter-0001-outline' });
        }
        if (url.endsWith('/runs/run-1')) {
          return Response.json({ runId: 'run-1', commandId: 'cmd-1', workspaceId: 'workspace-1', bookId: 'book-1', status: 'running', nextExpectedState: 'proposal-pending', createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z' });
        }
        if (url.endsWith('/commands/cmd-1')) {
          return Response.json({ commandId: 'cmd-1', runId: 'run-1', idempotencyKey: 'key-1', status: 'accepted', acceptedAt: '2026-08-17T00:00:00.000Z' });
        }
        if (url.endsWith('/audits/override/audit-1')) {
          return Response.json({ overrideReason: 'author decision', overrideBy: 'author-1', relatedRunId: 'run-1', failedChecks: [], scoreSnapshot: { approved: false, hardFailures: [], dimensionScores: { antiAiVoice: 80, webFictionPacing: 80, emotionCurve: 80, characterConsistency: 80, settingConsistency: 80, clueCausality: 80, readabilityLayout: 80, languageTexture: 80 }, totalScore: 80, rewriteDirectives: [], overrideEligible: true }, timestamp: '2026-08-17T00:00:00.000Z' });
        }
        return Response.json({ commandId: 'cmd-sync-1', runId: 'run-sync-1', acceptedAt: '2026-08-17T00:00:00.000Z', status: 'accepted', nextExpectedState: 'workspace-synced', sseChannel: '/runs/run-sync-1/stream' });
      },
    });

    await Promise.all([
      client.getArtifact('chapter-outline', 'chapter-0001-outline'),
      client.getRun('run-1'),
      client.getCommand('cmd-1'),
      client.getOverrideAudit('audit-1'),
      client.submitSync('re-sync-state', { workspaceId: 'workspace-1', bookId: 'book-1', requestedBy: 'author-1', approvalMode: 'manual', idempotencyKey: 'sync-1' }),
    ]);

    expect(requests).toEqual([
      { url: '/api/artifacts/chapter-outline/chapter-0001-outline', method: 'GET' },
      { url: '/api/runs/run-1', method: 'GET' },
      { url: '/api/commands/cmd-1', method: 'GET' },
      { url: '/api/audits/override/audit-1', method: 'GET' },
      { url: '/api/sync/re-sync-state', method: 'POST' },
    ]);
  });
});