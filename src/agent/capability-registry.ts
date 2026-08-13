/**
 * Capability registry loading, discovery reconciliation, and agent-capability assembly,
 * per docs/architecture/modules/08-graph-search-and-capabilities.md §8.5-§8.6.
 *
 * Contract (canonical):
 * - `state/capabilities/registry.md` is the sole authority for enablement, visibility,
 *   and allowed-agent scope.
 * - Other sources (mcp.json, skill/agent/prompt-pack definitions) only report discovered
 *   facts (version, source location, availability).
 * - A capability discovered but not registered is a warning (`discovered-unregistered`),
 *   never auto-enabled.
 * - A capability registered but absent from every discovery source is a blocking
 *   configuration error (`missing-source`); every workflow depending on it must be
 *   blocked.
 */
import { parse as parseYaml } from 'yaml';

import {
  CapabilityRegistrationStateSchema,
  type CapabilityRegistrationState,
} from '../domain/schema';

import type { AgentRole } from './model-tiers';

export const CAPABILITY_TYPE_VALUES = ['agent', 'skill', 'mcp', 'prompt-pack'] as const;

export type CapabilityType = (typeof CAPABILITY_TYPE_VALUES)[number];

export interface RegisteredCapability {
  readonly id: string;
  readonly type: CapabilityType;
  readonly enabled: boolean;
  readonly visibility: 'public' | 'restricted';
  readonly allowedAgents: readonly AgentRole[];
  readonly applicableArtifactTypes: readonly string[];
}

export interface DiscoveredCapabilitySource {
  readonly id: string;
  readonly type: CapabilityType;
  readonly source: string;
  readonly version?: string;
}

export class CapabilityRegistryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRegistryParseError';
  }
}

interface RawRegistryEntry {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly enabled?: unknown;
  readonly visibility?: unknown;
  readonly allowedAgents?: unknown;
  readonly applicableArtifactTypes?: unknown;
}

function toStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function requireId(entry: RawRegistryEntry): string {
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    throw new CapabilityRegistryParseError('Capability registry entry is missing a non-empty "id".');
  }
  return entry.id;
}

function requireType(id: string, entry: RawRegistryEntry): CapabilityType {
  if (typeof entry.type !== 'string' || !CAPABILITY_TYPE_VALUES.includes(entry.type as CapabilityType)) {
    throw new CapabilityRegistryParseError(
      `Capability registry entry "${id}" has an invalid "type" (must be one of ${CAPABILITY_TYPE_VALUES.join(', ')}).`,
    );
  }
  return entry.type as CapabilityType;
}

function parseRegistryEntry(entry: RawRegistryEntry): RegisteredCapability {
  const id = requireId(entry);
  const type = requireType(id, entry);

  return {
    id,
    type,
    enabled: entry.enabled !== false,
    visibility: entry.visibility === 'restricted' ? 'restricted' : 'public',
    allowedAgents: toStringArray(entry.allowedAgents) as readonly AgentRole[],
    applicableArtifactTypes: toStringArray(entry.applicableArtifactTypes),
  };
}

function extractRegistryYaml(trimmed: string): string {
  const delimiterPattern = /^---\n([\s\S]*?)\n---/;
  const match = delimiterPattern.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function parseRegistryYaml(yamlText: string): unknown {
  try {
    return parseYaml(yamlText);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new CapabilityRegistryParseError(`Failed to parse capability registry YAML: ${message}`);
  }
}

/**
 * Parses `state/capabilities/registry.md`. The file uses the same frontmatter
 * convention as other canonical Markdown (a YAML block delimited by `---`) holding a
 * top-level `capabilities` list, since the registry is canonical configuration and not
 * a free-form document.
 */
export function parseCapabilityRegistry(raw: string): readonly RegisteredCapability[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const yamlText = extractRegistryYaml(trimmed);
  const parsed = parseRegistryYaml(yamlText);

  const entries = (parsed as { capabilities?: unknown } | undefined)?.capabilities;
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map((entry) => parseRegistryEntry(entry as RawRegistryEntry));
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

export interface CapabilityReconciliationResult {
  readonly snapshots: readonly CapabilityRegistrationState[];
  readonly blockingCapabilityIds: readonly string[];
}

/**
 * Reconciles the canonical registry against discovered sources per §8.5's authority
 * rule: registered+found => `registered`; discovered but unregistered =>
 * `discovered-unregistered` (warning only); registered but not found => `missing-source`
 * (blocking).
 */
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

export class CapabilityAssemblyError extends Error {
  constructor(
    message: string,
    readonly blockingCapabilityIds: readonly string[],
  ) {
    super(message);
    this.name = 'CapabilityAssemblyError';
  }
}

/**
 * Resolves the set of capability ids a given agent role may use for a given artifact
 * type, enforcing the blocking rule: if any registered capability that would otherwise
 * apply to this role/artifact type is `missing-source`, assembly is rejected outright
 * rather than silently dropping the capability.
 */
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
