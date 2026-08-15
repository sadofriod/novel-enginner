import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { validateCapabilityStartup } from './capability-startup';

const REGISTRY = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    allowedAgents: [world-builder]
    applicableArtifactTypes: []
---
`;

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});


describe('validateCapabilityStartup', () => {
  test('allows registered capability sources and preserves unregistered discovery diagnostics', () => {
    const result = validateCapabilityStartup(REGISTRY, { servers: { cloakbrowser: {}, github: {} } });
    expect(result.blockingCapabilityIds).toEqual([]);
    expect(result.snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: 'github', status: 'discovered-unregistered' }),
    ]));
  });

  test('blocks startup when a registered source is missing', () => {
    expect(() => validateCapabilityStartup(REGISTRY, { servers: {} })).toThrow('Runtime startup blocked');
  });

  test('discovers workspace skill, agent, and prompt-pack sources at startup', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'novel-capabilities-'));
    temporaryRoots.push(workspaceRoot);
    mkdirSync(join(workspaceRoot, '.agents/skills/research'), { recursive: true });
    mkdirSync(join(workspaceRoot, '.github/agents'), { recursive: true });
    mkdirSync(join(workspaceRoot, '.github/prompts/editorial-pack'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.agents/skills/research/SKILL.md'), '# Research');
    writeFileSync(join(workspaceRoot, '.github/agents/world-builder.agent.md'), '# World builder');
    writeFileSync(join(workspaceRoot, '.github/prompts/editorial-pack/rules.md'), '# Rules');

    const result = validateCapabilityStartup(REGISTRY, { servers: { cloakbrowser: {} } }, workspaceRoot);

    expect(result.snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: 'research', status: 'discovered-unregistered' }),
      expect.objectContaining({ capabilityId: 'world-builder', status: 'discovered-unregistered' }),
      expect.objectContaining({ capabilityId: 'editorial-pack', status: 'discovered-unregistered' }),
    ]));
  });
});