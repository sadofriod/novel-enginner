import { describe, expect, test } from 'bun:test';

import { getBootstrapSessionsRoute } from './get';

describe('bootstrap sessions collection route', () => {
  test('matches the documented API surface', () => {
    expect(getBootstrapSessionsRoute.method).toBe('GET');
    expect(getBootstrapSessionsRoute.pattern).toBe('/bootstrap-sessions');
  });
});
