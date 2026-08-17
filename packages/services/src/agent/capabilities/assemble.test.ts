import { describe, expect, test } from 'bun:test';

import { CapabilityAssemblyError, assembleAgentCapabilities } from './assemble';
import type { RegisteredCapability } from './registry-parse';

const REGISTERED: readonly RegisteredCapability[] = [
  {
    id: 'graph-search',
    type: 'mcp',
    enabled: true,
    visibility: 'public',
    allowedAgents: ['world-builder'],
    applicableArtifactTypes: [],
  },
  {
    id: 'editing-skill',
    type: 'skill',
    enabled: true,
    visibility: 'public',
    allowedAgents: ['drafter'],
    applicableArtifactTypes: ['chapter-outline'],
  },
  {
    id: 'disabled-cap',
    type: 'skill',
    enabled: false,
    visibility: 'public',
    allowedAgents: ['world-builder'],
    applicableArtifactTypes: [],
  },
  {
    id: 'missing-cap',
    type: 'agent',
    enabled: true,
    visibility: 'public',
    allowedAgents: ['actor'],
    applicableArtifactTypes: ['chapter-manuscript'],
  },
];

const NO_BLOCKING = { snapshots: [], blockingCapabilityIds: [] };
const BLOCKING_MISSING_CAP = {
  snapshots: [],
  blockingCapabilityIds: ['missing-cap'],
};

describe('assembleAgentCapabilities', () => {
  test('returns enabled capabilities matching role and artifact type', () => {
    const result = assembleAgentCapabilities(
      'world-builder',
      'book',
      REGISTERED,
      NO_BLOCKING,
    );

    expect(result).toEqual(['graph-search']);
  });

  test('excludes disabled capabilities and role/artifact mismatches', () => {
    const result = assembleAgentCapabilities('world-builder', 'chapter-outline', REGISTERED, NO_BLOCKING);

    expect(result).toEqual(['graph-search']);
    expect(result).not.toContain('editing-skill');
    expect(result).not.toContain('disabled-cap');
  });

  test('throws CapabilityAssemblyError when an applicable capability is missing-source', () => {
    expect(() =>
      assembleAgentCapabilities('actor', 'chapter-manuscript', REGISTERED, BLOCKING_MISSING_CAP),
    ).toThrow(CapabilityAssemblyError);
  });

  test('does not throw when the blocked capability is not applicable to the role', () => {
    expect(() =>
      assembleAgentCapabilities('world-builder', 'book', REGISTERED, BLOCKING_MISSING_CAP),
    ).not.toThrow();
  });

  test('returns an empty list when nothing is applicable', () => {
    expect(assembleAgentCapabilities('drafter', 'book', REGISTERED, NO_BLOCKING)).toEqual([]);
  });
});
