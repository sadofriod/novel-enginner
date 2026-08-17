/**
 * Reconciliation of the canonical capability registry against discovered
 * sources, per docs/architecture/modules/08-graph-search-and-capabilities.md
 * §8.5's authority rule:
 * - registered + found => `registered`
 * - discovered but unregistered => `discovered-unregistered` (warning only)
 * - registered but not found => `missing-source` (blocking)
 */
import {
  CapabilityRegistrationStateSchema,
  type CapabilityRegistrationState,
} from '../../domain/schema';

import type { DiscoveredCapabilitySource } from './discovery';
import type { RegisteredCapability } from './registry-parse';

export interface CapabilityReconciliationResult {
  readonly snapshots: readonly CapabilityRegistrationState[];
  readonly blockingCapabilityIds: readonly string[];
}

export function reconcileCapabilities(
  registered: readonly RegisteredCapability[],
  discovered: readonly DiscoveredCapabilitySource[],
): CapabilityReconciliationResult {
  const discoveredById = new Map(discovered.map((entry) => [entry.id, entry]));
  const registeredIds = new Set(registered.map((entry) => entry.id));
  const snapshots: CapabilityRegistrationState[] = [];
  const blockingCapabilityIds: string[] = [];

  for (const capability of registered) {
    const found = discoveredById.get(capability.id);
    if (found === undefined) {
      blockingCapabilityIds.push(capability.id);
      snapshots.push(
        CapabilityRegistrationStateSchema.parse({
          status: 'missing-source',
          capabilityId: capability.id,
          details: `Capability "${capability.id}" is registered but was not found in any discovery source.`,
        }),
      );
      continue;
    }
    snapshots.push(
      CapabilityRegistrationStateSchema.parse({
        status: 'registered',
        capabilityId: capability.id,
        source: found.source,
      }),
    );
  }

  for (const discoveredEntry of discovered) {
    if (registeredIds.has(discoveredEntry.id)) {
      continue;
    }
    snapshots.push(
      CapabilityRegistrationStateSchema.parse({
        status: 'discovered-unregistered',
        capabilityId: discoveredEntry.id,
        source: discoveredEntry.source,
        details: `Capability "${discoveredEntry.id}" was discovered but is not declared in the registry; it will not be enabled.`,
      }),
    );
  }

  return { snapshots, blockingCapabilityIds };
}
