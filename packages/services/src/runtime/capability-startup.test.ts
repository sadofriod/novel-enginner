import { describe, expect, test } from 'bun:test';

import { validateCapabilityStartup } from './capability-startup';

const REGISTRY = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    allowedAgents: [world-builder]
    applicableArtifactTypes: []
---
`;

describe('validateCapabilityStartup', () => {
  test('allows registered capability sources and preserves unregistered discovery diagnostics', () => {
    const result = validateCapabilityStartup(REGISTRY, { servers: { cloakbrowser: {}, github: {} } });
    expect(result.blockingCapabilityIds).toEqual([]);
    expect(result.snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: 'github', status: 'discovered-unregistered' }),
    ]));
  });

  test('blocks startup when a registered source is missing', () => {
    expect(() => validateCapabilityStartup(REGISTRY, { servers: {} })).toThrow('Runtime startup blocked');
  });
});