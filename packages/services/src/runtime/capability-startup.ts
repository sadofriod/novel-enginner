import { validateCapabilitiesOrThrow, type CapabilityReconciliationResult } from '../agent/capability-registry';

export function validateCapabilityStartup(
  registryMarkdown: string,
  mcpConfig: { readonly servers?: Record<string, unknown> },
): CapabilityReconciliationResult {
  return validateCapabilitiesOrThrow(registryMarkdown, mcpConfig);
}