import { describe, expect, test } from 'bun:test';
import { moveCursor, toggleOption } from './interactive-cli';

describe('interactive CLI selection', () => {
  test('wraps the cursor at both ends', () => {
    expect(moveCursor(0, 'up', 5)).toBe(4);
    expect(moveCursor(4, 'down', 5)).toBe(0);
    expect(moveCursor(2, 'down', 5)).toBe(3);
  });

  test('toggles only the focused option', () => {
    expect(toggleOption([false, true, false], 0)).toEqual([true, true, false]);
    expect(toggleOption([false, true, false], 1)).toEqual([false, false, false]);
  });
});