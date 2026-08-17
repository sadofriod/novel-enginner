import { describe, expect, test } from 'bun:test';

import { resolveInngestClientOptions } from './inngest-client';

describe('Inngest client configuration', () => {
  test('uses a self-hosted base URL and event key when configured', () => {
    expect(resolveInngestClientOptions({
      INNGEST_BASE_URL: 'http://localhost:8288',
      INNGEST_EVENT_KEY: 'local-event-key',
    })).toEqual({
      baseUrl: 'http://localhost:8288',
      eventKey: 'local-event-key',
    });
  });

  test('omits unset or blank settings so the SDK can use its defaults', () => {
    expect(resolveInngestClientOptions({
      INNGEST_BASE_URL: ' ',
      INNGEST_EVENT_KEY: '',
    })).toEqual({});
  });
});