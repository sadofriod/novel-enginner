/**
 * Startup validation of the capability registry against discovered sources, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.5:
 * "registered but absent from every discovery source is a blocking configuration
 * error." The server fails fast instead of silently degrading at runtime.
 */
import { CapabilityAssemblyError } from './assemble';
import { discoverCapabilitiesFromAllSources, type CapabilityDiscoverySources } from './discovery';
import { parseCapabilityRegistry } from './registry-parse';
import {
  reconcileCapabilities,
  type CapabilityReconciliationResult,
} from './reconcile';

export type { CapabilityReconciliationResult } from './reconcile';

export function validateCapabilitiesOrThrow(
  registryMarkdown: string,
  mcpConfigJson: { readonly servers?: Record<string, unknown> },
  sources: Omit<CapabilityDiscoverySources, 'mcpConfig'> = {},
): CapabilityReconciliationResult {
  const registered = parseCapabilityRegistry(registryMarkdown);
  const discovered = discoverCapabilitiesFromAllSources({ ...sources, mcpConfig: mcpConfigJson });
  const result = reconcileCapabilities(registered, discovered);

  if (result.blockingCapabilityIds.length > 0) {
    throw new CapabilityAssemblyError(
      `Runtime startup blocked: registered capabilities are missing from all discovery sources: ${result.blockingCapabilityIds.join(', ')}.`,
      result.blockingCapabilityIds,
    );
  }

  return result;
}
