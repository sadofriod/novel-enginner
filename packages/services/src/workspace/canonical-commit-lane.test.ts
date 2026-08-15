import { describe, expect, test } from 'bun:test';

import { withCanonicalCommitLane } from './canonical-commit-lane';

describe('canonical commit lane', () => {
  test('serializes commits for the same book while allowing different books to overlap', async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withCanonicalCommitLane('book-1', async () => {
      events.push('book-1:start');
      await firstBlocked;
      events.push('book-1:end');
    });
    const second = withCanonicalCommitLane('book-1', async () => {
      events.push('book-1:second');
    });
    const otherBook = withCanonicalCommitLane('book-2', async () => {
      events.push('book-2:start');
    });

    await otherBook;
    expect(events).toEqual(['book-1:start', 'book-2:start']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(['book-1:start', 'book-2:start', 'book-1:end', 'book-1:second']);
  });
});
