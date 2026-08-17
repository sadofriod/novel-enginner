/**
 * Parsing of the canonical capability registry
 * (`state/capabilities/registry.md`), per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.5-§8.6.
 *
 * The registry is the sole authority for enablement, visibility, and
 * allowed-agent scope. Parsing only reads facts from the frontmatter YAML; it
 * never decides enablement itself.
 */
import { parse as parseYaml } from 'yaml';

import { AGENT_ROLE_VALUES, type AgentRole } from '../model-tiers';

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

function requireAllowedAgents(id: string, value: unknown): readonly AgentRole[] {
  const raw = toStringArray(value);
  const invalid = raw.filter((role) => !AGENT_ROLE_VALUES.includes(role as AgentRole));
  if (invalid.length > 0) {
    throw new CapabilityRegistryParseError(
      `Capability registry entry "${id}" has unknown allowedAgents values: ${invalid.join(', ')} (valid: ${AGENT_ROLE_VALUES.join(', ')}).`,
    );
  }
  return raw as readonly AgentRole[];
}

function parseRegistryEntry(entry: RawRegistryEntry): RegisteredCapability {
  const id = requireId(entry);
  const type = requireType(id, entry);

  return {
    id,
    type,
    enabled: entry.enabled !== false,
    visibility: entry.visibility === 'restricted' ? 'restricted' : 'public',
    allowedAgents: requireAllowedAgents(id, entry.allowedAgents),
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
