import { describe, expect, test } from 'bun:test';

import { getBootstrapSessionRoute } from './get';

describe('bootstrap session detail route', () => {
  test('matches the documented API surface', () => {
    expect(getBootstrapSessionRoute.method).toBe('GET');
    expect(getBootstrapSessionRoute.pattern).toBe('/bootstrap-sessions/:sessionId');
  });
});
