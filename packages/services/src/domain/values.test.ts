import { describe, expect, test } from 'bun:test';

import {
  CAPABILITY_REGISTRATION_STATUS_VALUES,
  PROPOSAL_ARTIFACT_TYPE_VALUES,
  PROPOSAL_STATUS_VALUES,
} from './values';

describe('domain value registries', () => {
  test('includes the bootstrap proposal artifact types', () => {
    expect(PROPOSAL_ARTIFACT_TYPE_VALUES).toContain('project-brief');
    expect(PROPOSAL_ARTIFACT_TYPE_VALUES).toContain('world-foundation');
    expect(PROPOSAL_ARTIFACT_TYPE_VALUES).toContain('story-blueprint');
  });

  test('keeps the proposal lifecycle statuses used by the architecture', () => {
    expect(PROPOSAL_STATUS_VALUES).toEqual(
      expect.arrayContaining(['superseded', 'commit-blocked', 'waiting-sync', 'exported']),
    );
  });

  test('keeps capability discovery statuses', () => {
    expect(CAPABILITY_REGISTRATION_STATUS_VALUES).toEqual(
      expect.arrayContaining(['registered', 'discovered-unregistered', 'missing-source']),
    );
  });
});
