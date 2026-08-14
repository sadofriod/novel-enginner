import { describe, expect, test } from 'bun:test';

import { getBootstrapSessionEvidenceRoute } from './get';

describe('bootstrap session evidence route', () => {
  test('matches the documented API surface', () => {
    expect(getBootstrapSessionEvidenceRoute.method).toBe('GET');
    expect(getBootstrapSessionEvidenceRoute.pattern).toBe('/bootstrap-sessions/:sessionId/evidence');
  });
});
