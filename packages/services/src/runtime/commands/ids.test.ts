import { describe, expect, test } from 'bun:test';

import { nextCommandId, nextRunId } from './ids';

describe('command and run id generation', () => {
  test('nextRunId produces zero-padded sequential ids', () => {
    const first = nextRunId();
    const second = nextRunId();

    expect(first).toMatch(/^run-\d{6}$/);
    expect(Number.parseInt(second.split('-')[1] ?? '0', 10)).toBe(
      Number.parseInt(first.split('-')[1] ?? '0', 10) + 1,
    );
  });

  test('nextCommandId produces zero-padded sequential ids', () => {
    const first = nextCommandId();
    const second = nextCommandId();

    expect(first).toMatch(/^cmd-\d{6}$/);
    expect(second).not.toBe(first);
  });
});
