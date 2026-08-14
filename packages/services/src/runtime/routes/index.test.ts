import { describe, expect, test } from 'bun:test';

import { listRegisteredRoutes } from './index';

describe('registered runtime routes', () => {
  test('covers the documented API surface and web console entry points', () => {
    const routes = listRegisteredRoutes().map((route) => `${route.method} ${route.pattern}`);

    expect(routes).toContain('POST /commands');
    expect(routes).toContain('GET /commands/:commandId');
    expect(routes).toContain('GET /runs');
    expect(routes).toContain('GET /runs/:runId');
    expect(routes).toContain('GET /runs/:runId/stream');
    expect(routes).toContain('GET /artifacts');
    expect(routes).toContain('GET /artifacts/:artifactType/:targetId');
    expect(routes).toContain('GET /audits/override/:overrideAuditId');
    expect(routes).toContain('GET /bootstrap-sessions');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId/revisions');
    expect(routes).toContain('GET /bootstrap-sessions/:sessionId/evidence');
    expect(routes).toContain('POST /sync/rebuild-graph');
    expect(routes).toContain('POST /sync/re-sync-state');
    expect(routes).toContain('GET /');
    expect(routes).toContain('GET /app');
  });
});
