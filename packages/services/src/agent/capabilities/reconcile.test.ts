import { describe, expect, test } from 'bun:test';

import type { DiscoveredCapabilitySource } from './discovery';
import type { RegisteredCapability } from './registry-parse';
import { reconcileCapabilities } from './reconcile';

const REGISTERED: readonly RegisteredCapability[] = [
  {
    id: 'cloakbrowser',
    type: 'mcp',
    enabled: true,
    visibility: 'public',
    allowedAgents: ['world-builder'],
    applicableArtifactTypes: [],
  },
  {
    id: 'style-skill',
    type: 'skill',
    enabled: true,
    visibility: 'public',
    allowedAgents: [],
    applicableArtifactTypes: [],
  },
];

const DISCOVERED: readonly DiscoveredCapabilitySource[] = [
  { id: 'cloakbrowser', type: 'mcp', source: 'mcp.json' },
  { id: 'stray-agent', type: 'agent', source: 'agents/stray-agent.md' },
];

describe('reconcileCapabilities', () => {
  test('marks registered+found capabilities as registered', () => {
    const result = reconcileCapabilities(REGISTERED, DISCOVERED);

    expect(result.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'registered', capabilityId: 'cloakbrowser', source: 'mcp.json' }),
      ]),
    );
    expect(result.blockingCapabilityIds).not.toContain('cloakbrowser');
  });

  test('marks discovered-but-unregistered capabilities as non-blocking warnings', () => {
    const result = reconcileCapabilities(REGISTERED, DISCOVERED);

    expect(result.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'discovered-unregistered', capabilityId: 'stray-agent' }),
      ]),
    );
    expect(result.blockingCapabilityIds).not.toContain('stray-agent');
  });

  test('marks registered-but-missing capabilities as blocking', () => {
    const result = reconcileCapabilities(REGISTERED, DISCOVERED);

    expect(result.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'missing-source', capabilityId: 'style-skill' }),
      ]),
    );
    expect(result.blockingCapabilityIds).toContain('style-skill');
  });

  test('returns an empty result when nothing is registered or discovered', () => {
    expect(reconcileCapabilities([], [])).toEqual({ snapshots: [], blockingCapabilityIds: [] });
  });
});
