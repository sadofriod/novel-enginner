import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { validateCapabilitiesOrThrow, type CapabilityReconciliationResult } from '../agent/capability-registry';

interface CapabilitySourcePaths {
  readonly skillFiles: readonly string[];
  readonly agentFiles: readonly string[];
  readonly promptPackFiles: readonly string[];
}

function relativePath(workspaceRoot: string, filePath: string): string {
  return relative(workspaceRoot, filePath).split('\\').join('/');
}

function collectFiles(root: string, matches: (name: string) => boolean): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, matches));
    } else if (matches(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectDirectorySources(workspaceRoot: string, roots: readonly string[], marker: string): readonly string[] {
  const sources: string[] = [];
  for (const root of roots) {
    const markerFiles = collectFiles(join(workspaceRoot, root), (name) => name === marker);
    sources.push(...markerFiles.map((filePath) => relativePath(workspaceRoot, dirname(filePath))));
  }
  return sources;
}

function collectSkillSources(workspaceRoot: string): readonly string[] {
  const roots = ['.agents/skills', '.github/skills', 'skills'];
  const directorySources = collectDirectorySources(workspaceRoot, roots, 'SKILL.md');
  const fileSources = roots.flatMap((root) => collectFiles(join(workspaceRoot, root), (name) => name.endsWith('.skill.md')))
    .map((filePath) => relativePath(workspaceRoot, filePath));
  return directorySources.concat(fileSources);
}

function collectPromptPackDirectories(workspaceRoot: string, roots: readonly string[]): readonly string[] {
  const sources: string[] = [];
  for (const root of roots) {
    const rootPath = join(workspaceRoot, root);
    if (!existsSync(rootPath)) {
      continue;
    }
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        sources.push(relativePath(workspaceRoot, join(rootPath, entry.name)));
      }
    }
  }
  return sources;
}

function discoverCapabilitySourcePaths(workspaceRoot: string): CapabilitySourcePaths {
  const skillFiles = collectSkillSources(workspaceRoot);
  const agentFiles = ['.agents/agents', '.github/agents', 'agents']
    .flatMap((root) => collectFiles(join(workspaceRoot, root), (name) => name.endsWith('.agent.md')))
    .map((filePath) => relativePath(workspaceRoot, filePath))
    .concat(collectDirectorySources(workspaceRoot, ['.agents/agents', '.github/agents', 'agents'], 'AGENT.md'));
  const promptPackFiles = ['prompts', '.github/prompts', '.agents/prompts']
    .flatMap((root) => collectFiles(join(workspaceRoot, root), (name) => name.endsWith('.prompt.md')))
    .map((filePath) => relativePath(workspaceRoot, filePath))
    .concat(collectPromptPackDirectories(workspaceRoot, ['prompts', '.github/prompts', '.agents/prompts']));

  return { skillFiles, agentFiles, promptPackFiles };
}

export function validateCapabilityStartup(
  registryMarkdown: string,
  mcpConfig: { readonly servers?: Record<string, unknown> },
  workspaceRoot = process.cwd(),
): CapabilityReconciliationResult {
  return validateCapabilitiesOrThrow(registryMarkdown, mcpConfig, discoverCapabilitySourcePaths(workspaceRoot));
}