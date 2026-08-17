import { describe, expect, test } from 'bun:test';

import { guardCommandAgainstWorkspaceValidity } from './index';

describe('guardCommandAgainstWorkspaceValidity', () => {
  test('allows approval decisions to enter the waiting-sync queue while dirty', () => {
    expect(guardCommandAgainstWorkspaceValidity('propose', 'dirty').blocked).toBe(true);
    expect(guardCommandAgainstWorkspaceValidity('approve', 'dirty').blocked).toBe(false);
    expect(guardCommandAgainstWorkspaceValidity('override-approve', 'dirty').blocked).toBe(false);
    expect(guardCommandAgainstWorkspaceValidity('approve', 'invalid').blocked).toBe(true);
  });

  test('allows write-related intents when the workspace is clean', () => {
    expect(guardCommandAgainstWorkspaceValidity('propose', 'clean').blocked).toBe(false);
  });

  test('never blocks re-sync-state itself', () => {
    expect(guardCommandAgainstWorkspaceValidity('re-sync-state', 'invalid').blocked).toBe(false);
  });
});
