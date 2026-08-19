import { describe, expect, test } from 'bun:test';

import { listRegisteredRoutes } from './index';

describe('registered runtime routes', () => {
  test('covers the documented API surface and web console entry points', () => {
    const routes = listRegisteredRoutes().map((route) => `${route.method} ${route.pattern}`);

    expect(routes).toContain('POST /commands');
    expect(routes).toContain('GET /commands/:commandId');
    expect(routes).toContain('GET /runs');
    expect(routes).toContain('GET /runs/:runId');
    expect(routes).toContain('GET /artifacts');
    expect(routes).toContain('GET /artifacts/:artifactType/:targetId');
    expect(routes).toContain('GET /audits/override/:overrideAuditId');
    expect(routes).toContain('GET /bootstrap-sessions');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId/revisions');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId/evidence');
    expect(routes).toContain('GET /workspace/tree');
    expect(routes).toContain('GET /workspace/entity/:kind/:id');
    expect(routes).toContain('GET /graph');
    expect(routes).toContain('GET /search');
    expect(routes).toContain('POST /sync/rebuild-graph');
    expect(routes).toContain('POST /sync/re-sync-state');
    expect(routes).toContain('GET /proposals/:proposalId/threads');
    expect(routes).toContain('GET /proposals/:proposalId/chain');
    expect(routes).toContain('POST /proposals/:proposalId/threads');
    expect(routes).toContain('POST /threads/:threadId/comments');
    expect(routes).toContain('POST /threads/:threadId/resolve');
    expect(routes).toContain('POST /threads/:threadId/unresolve');
    expect(routes).toContain('PATCH /comments/:commentId');
    expect(routes).toContain('DELETE /comments/:commentId');
    expect(routes).toContain('GET /');
    expect(routes).toContain('GET /app');
  });
});
