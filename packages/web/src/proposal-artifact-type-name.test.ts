import { describe, expect, test } from 'bun:test';

import { getProposalArtifactTypeName } from './proposal-artifact-type-name';

describe('getProposalArtifactTypeName', () => {
  test('returns a Chinese name for a proposal artifact type', () => {
    expect(getProposalArtifactTypeName('chapter-outline')).toBe('章节细纲');
  });
});