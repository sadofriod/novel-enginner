/**
 * Agent-capability assembly, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.6.
 *
 * Enforces the blocking rule: if any registered capability that would otherwise
 * apply to this role/artifact type is `missing-source`, assembly is rejected
 * outright rather than silently dropping the capability.
 */
import type { AgentRole } from '../model-tiers';

import type { RegisteredCapability } from './registry-parse';
import type { CapabilityReconciliationResult } from './reconcile';

export class CapabilityAssemblyError extends Error {
  constructor(
    message: string,
    readonly blockingCapabilityIds: readonly string[],
  ) {
    super(message);
    this.name = 'CapabilityAssemblyError';
  }
}

export function assembleAgentCapabilities(
  role: AgentRole,
  artifactType: string,
  registered: readonly RegisteredCapability[],
  reconciliation: CapabilityReconciliationResult,
): readonly string[] {
  const blocking = new Set(reconciliation.blockingCapabilityIds);
  const applicable = registered.filter(
    (capability) =>
      capability.enabled &&
      capability.allowedAgents.includes(role) &&
      (capability.applicableArtifactTypes.length === 0 ||
        capability.applicableArtifactTypes.includes(artifactType)),
  );

  const blockedApplicable = applicable.filter((capability) => blocking.has(capability.id));
  if (blockedApplicable.length > 0) {
    const ids = blockedApplicable.map((capability) => capability.id);
    throw new CapabilityAssemblyError(
      `Agent role "${role}" depends on missing-source capabilities: ${ids.join(', ')}.`,
      ids,
    );
  }

  return applicable.map((capability) => capability.id);
}
