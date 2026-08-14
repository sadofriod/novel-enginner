import { describe, expect, test } from 'bun:test';

import { getBootstrapSessionRevisionsRoute } from './get';

describe('bootstrap session revisions route', () => {
  test('matches the documented API surface', () => {
    expect(getBootstrapSessionRevisionsRoute.method).toBe('GET');
    expect(getBootstrapSessionRevisionsRoute.pattern).toBe('/bootstrap-sessions/:sessionId/revisions');
  });
});
