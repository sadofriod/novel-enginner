import { describe, expect, test } from 'bun:test';

import { CapabilityAssemblyError } from './assemble';
import { validateCapabilitiesOrThrow } from './validate';

const REGISTRY = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    allowedAgents: [world-builder]
    applicableArtifactTypes: []
---
`;

describe('validateCapabilitiesOrThrow', () => {
  test('returns the reconciliation result when nothing blocks startup', () => {
    const result = validateCapabilitiesOrThrow(REGISTRY, { servers: { cloakbrowser: {} } });

    expect(result.blockingCapabilityIds).toEqual([]);
    expect(result.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'registered', capabilityId: 'cloakbrowser' }),
      ]),
    );
  });

  test('includes discovered-unregistered sources without blocking', () => {
    const result = validateCapabilitiesOrThrow(REGISTRY, {
      servers: { cloakbrowser: {}, stray: {} },
    });

    expect(result.blockingCapabilityIds).toEqual([]);
    expect(result.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'discovered-unregistered', capabilityId: 'stray' }),
      ]),
    );
  });

  test('throws CapabilityAssemblyError when a registered source is missing', () => {
    let caught: CapabilityAssemblyError | undefined;
    try {
      validateCapabilitiesOrThrow(REGISTRY, { servers: {} });
    } catch (error) {
      caught = error as CapabilityAssemblyError;
    }

    expect(caught).toBeInstanceOf(CapabilityAssemblyError);
    expect(caught?.message).toContain('Runtime startup blocked');
    expect(caught?.blockingCapabilityIds).toEqual(['cloakbrowser']);
  });
});
