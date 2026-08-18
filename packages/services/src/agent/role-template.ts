/**
 * Role-template loading from `agents/<role>.agent.md`, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.6
 * ("Agent 角色模板" layer) and the system agent role definitions in `agents/`.
 *
 * The agent.md body is the role template that lands in the
 * `agent-role-template` prompt layer. A missing file is not fatal: callers fall
 * back to a stub so the workflow can keep running, consistent with the
 * "unregistered sources only warn" capability philosophy.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AgentRole } from './model-tiers';

export const AGENT_FILE_SUFFIX = '.agent.md';

/** Absolute path to the agent definition file for a role under a workspace root. */
export function resolveAgentDefinitionPath(workspaceRoot: string, role: AgentRole): string {
  return join(workspaceRoot, 'agents', `${role}${AGENT_FILE_SUFFIX}`);
}

/** Strips the leading YAML frontmatter block from an agent definition, keeping the body. */
export function stripAgentFrontmatter(raw: string): string {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(raw);
  return (match === null ? raw : raw.slice(match[0].length)).trim();
}

/**
 * Loads the role template (agent.md body) for a role. Returns `undefined` when the
 * file is absent so callers can fall back to a stub without failing the task.
 */
export async function loadRoleTemplate(workspaceRoot: string, role: AgentRole): Promise<string | undefined> {
  try {
    const raw = await readFile(resolveAgentDefinitionPath(workspaceRoot, role), 'utf8');
    return stripAgentFrontmatter(raw);
  } catch {
    return undefined;
  }
}

/** Resolves the role template, falling back to a stub line when no agent.md exists. */
export async function resolveRoleTemplate(workspaceRoot: string, role: AgentRole): Promise<string> {
  const loaded = await loadRoleTemplate(workspaceRoot, role);
  return loaded ?? `You are the ${role} agent.`;
}
