import { describe, expect, test } from 'bun:test';

import { shouldDispatchToInngest } from './command';

describe('Inngest command dispatch configuration', () => {
  test('dispatches only outside test mode with a non-blank event key', () => {
    expect(shouldDispatchToInngest({ NODE_ENV: 'development', INNGEST_EVENT_KEY: 'local-event-key' })).toBe(true);
    expect(shouldDispatchToInngest({ NODE_ENV: 'test', INNGEST_EVENT_KEY: 'local-event-key' })).toBe(false);
    expect(shouldDispatchToInngest({ NODE_ENV: 'development', INNGEST_EVENT_KEY: ' ' })).toBe(false);
  });
});