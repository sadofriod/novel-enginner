/**
 * Capability discovery from non-authoritative sources (mcp.json, skill/agent/
 * prompt-pack definitions), per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.5.
 *
 * Discovery only reports facts (version, source location, availability). It
 * never enables anything — the canonical registry decides enablement.
 */
export interface DiscoveredCapabilitySource {
  readonly id: string;
  readonly type: 'mcp' | 'skill' | 'agent' | 'prompt-pack';
  readonly source: string;
  readonly version?: string;
}

interface McpServerConfig {
  readonly [serverId: string]: unknown;
}

interface McpConfigFile {
  readonly servers?: McpServerConfig;
}

/**
 * Discovers MCP-typed capabilities from `mcp.json`. Each configured server is reported
 * as a discovered fact only; the registry decides whether it is actually enabled.
 */
export function discoverMcpCapabilities(mcpConfig: McpConfigFile): readonly DiscoveredCapabilitySource[] {
  const servers = mcpConfig.servers ?? {};
  return Object.keys(servers).map((serverId) => ({
    id: serverId,
    type: 'mcp' as const,
    source: 'mcp.json',
  }));
}

export type CapabilityDiscoverySources = {
  readonly mcpConfig?: McpConfigFile;
  readonly skillFiles?: readonly string[];
  readonly agentFiles?: readonly string[];
  readonly promptPackFiles?: readonly string[];
};

function capabilityIdFromPath(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath;
  return fileName
    .replace(/\.(md|markdown|json|yaml|yml|ts|tsx|js|jsx)$/i, '')
    .replace(/\.(prompt|agent|skill)$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function discoverFiles(
  files: readonly string[],
  type: Exclude<DiscoveredCapabilitySource['type'], 'mcp'>,
): readonly DiscoveredCapabilitySource[] {
  return files
    .map((source) => ({
      id: capabilityIdFromPath(source),
      type,
      source,
    }))
    .filter((entry) => entry.id.length > 0);
}

/** Discovers all non-authoritative capability sources without enabling any of them. */
export function discoverCapabilitiesFromAllSources(
  sources: CapabilityDiscoverySources,
): readonly DiscoveredCapabilitySource[] {
  const discovered = [
    ...discoverMcpCapabilities(sources.mcpConfig ?? {}),
    ...discoverFiles(sources.skillFiles ?? [], 'skill'),
    ...discoverFiles(sources.agentFiles ?? [], 'agent'),
    ...discoverFiles(sources.promptPackFiles ?? [], 'prompt-pack'),
  ];
  const seen = new Set<string>();
  return discovered.filter((entry) => {
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
