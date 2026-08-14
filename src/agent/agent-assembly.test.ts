import { describe, expect, test } from 'bun:test';

import {
  assembleAgentCapabilities,
  assemblePromptLayers,
  CapabilityAssemblyError,
  createDefaultModelProvider,
  discoverCapabilitiesFromAllSources,
  discoverMcpCapabilities,
  OpenAiModelProvider,
  ProviderConfigError,
  parseCapabilityRegistry,
  reconcileCapabilities,
  resolveDefaultMcpScopeForRole,
  resolveModelTierForRole,
} from './index';

const REGISTRY_MARKDOWN = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    visibility: restricted
    allowedAgents:
      - world-builder
      - reviewer
    applicableArtifactTypes: []
  - id: ghost-tool
    type: mcp
    enabled: true
    allowedAgents:
      - world-builder
    applicableArtifactTypes: []
---

# Capability Registry
`;

describe('provider abstraction', () => {
  test('OpenAI provider resolves model ids per tier', () => {
    const provider = new OpenAiModelProvider({ apiKey: 'test-key' });
    expect(provider.resolveModelId('flagship')).toBe('gpt-4.1');
    expect(provider.resolveModelId('economy')).toBe('gpt-4.1-nano');
  });

  test('OpenAI provider rejects completion without an apiKey', async () => {
    const provider = new OpenAiModelProvider();
    await expect(provider.complete({ tier: 'balanced', prompt: 'hello' })).rejects.toBeInstanceOf(
      ProviderConfigError,
    );
  });

  test('OpenAI provider sends system and prompt to the configured model', async () => {
    const previousFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = (async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { content: 'generated text' }, finish_reason: 'stop' }],
          model: 'gpt-4.1-mini',
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const provider = new OpenAiModelProvider({ apiKey: 'test-key' });
      const result = await provider.complete({
        tier: 'balanced',
        system: 'You are concise.',
        prompt: 'Write one sentence.',
      });

      expect(result.text).toBe('generated text');
      expect(result.modelId).toBe('gpt-4.1-mini');
      expect(requests).toHaveLength(1);
      const body = (await requests[0]?.json()) as {
        model?: string;
        messages?: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe('gpt-4.1-mini');
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'Write one sentence.' },
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('createDefaultModelProvider reads env configuration', () => {
    const provider = createDefaultModelProvider({ OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'https://example.test' });
    expect(provider.providerId).toBe('openai');
  });
});

describe('agent role model tiers and mcp scope', () => {
  test('flagship-tier roles map correctly', () => {
    expect(resolveModelTierForRole('world-builder')).toBe('flagship');
    expect(resolveModelTierForRole('drafter')).toBe('balanced');
    expect(resolveModelTierForRole('update-actor')).toBe('economy');
  });

  test('drafter and actor have no default external mcp scope', () => {
    expect(resolveDefaultMcpScopeForRole('drafter')).toEqual([]);
    expect(resolveDefaultMcpScopeForRole('actor')).toEqual([]);
  });

  test('worldBuilder/plotPlanner/reviewer default to cloakbrowser', () => {
    expect(resolveDefaultMcpScopeForRole('world-builder')).toEqual(['cloakbrowser']);
    expect(resolveDefaultMcpScopeForRole('reviewer')).toEqual(['cloakbrowser']);
  });

  test('assemblePromptLayers orders and filters layers', () => {
    const result = assemblePromptLayers([
      { layer: 'task-parameters', content: 'task params' },
      { layer: 'system-hard-rules', content: 'hard rules' },
      { layer: 'project-policy', content: '' },
    ]);
    expect(result).toBe('hard rules\n\ntask params');
  });
});

describe('capability registry authority and discovery reconciliation', () => {
  test('parses registered capabilities from canonical markdown', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    expect(registered).toHaveLength(2);
    expect(registered[0]?.id).toBe('cloakbrowser');
    expect(registered[0]?.allowedAgents).toContain('world-builder');
  });

  test('discovers mcp capabilities from mcp.json shape', () => {
    const discovered = discoverMcpCapabilities({
      servers: { cloakbrowser: {}, github: {}, obsidian: {} },
    });
    expect(discovered.map((entry) => entry.id).sort()).toEqual(['cloakbrowser', 'github', 'obsidian']);
  });

  test('discovers skill, agent, and prompt-pack sources without enabling them', () => {
    const discovered = discoverCapabilitiesFromAllSources({
      mcpConfig: { servers: { cloakbrowser: {} } },
      skillFiles: ['.agents/skills/research.skill.md'],
      agentFiles: ['.agents/agents/world-builder.agent.md'],
      promptPackFiles: ['prompts/anti-ai.prompt.md'],
    });

    expect(discovered).toEqual([
      { id: 'cloakbrowser', type: 'mcp', source: 'mcp.json' },
      { id: 'research', type: 'skill', source: '.agents/skills/research.skill.md' },
      { id: 'world-builder', type: 'agent', source: '.agents/agents/world-builder.agent.md' },
      { id: 'anti-ai', type: 'prompt-pack', source: 'prompts/anti-ai.prompt.md' },
    ]);
  });

  test('registered + discovered => registered status', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {} } });
    const result = reconcileCapabilities(registered, discovered);

    const cloak = result.snapshots.find((s) => s.capabilityId === 'cloakbrowser');
    expect(cloak?.status).toBe('registered');
  });

  test('registered but not discovered => missing-source and blocks dependants', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {} } });
    const result = reconcileCapabilities(registered, discovered);

    const ghost = result.snapshots.find((s) => s.capabilityId === 'ghost-tool');
    expect(ghost?.status).toBe('missing-source');
    expect(result.blockingCapabilityIds).toContain('ghost-tool');
  });

  test('discovered but unregistered => warning only, not enabled', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {}, github: {} } });
    const result = reconcileCapabilities(registered, discovered);

    const github = result.snapshots.find((s) => s.capabilityId === 'github');
    expect(github?.status).toBe('discovered-unregistered');
  });

  test('assembleAgentCapabilities returns applicable, non-blocked capability ids', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {} } });
    const reconciliation = reconcileCapabilities(registered, discovered);

    const ids = assembleAgentCapabilities('world-builder', 'chapter-outline', registered, {
      snapshots: reconciliation.snapshots,
      blockingCapabilityIds: [],
    });
    expect(ids).toEqual(['cloakbrowser', 'ghost-tool']);
  });

  test('assembleAgentCapabilities blocks when a dependency is missing-source', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {} } });
    const reconciliation = reconcileCapabilities(registered, discovered);

    expect(() =>
      assembleAgentCapabilities('world-builder', 'chapter-outline', registered, reconciliation),
    ).toThrow(CapabilityAssemblyError);
  });

  test('reviewer role is unaffected by a world-builder-only missing capability', () => {
    const registered = parseCapabilityRegistry(REGISTRY_MARKDOWN);
    const discovered = discoverMcpCapabilities({ servers: { cloakbrowser: {} } });
    const reconciliation = reconcileCapabilities(registered, discovered);

    const ids = assembleAgentCapabilities('reviewer', 'chapter-outline', registered, reconciliation);
    expect(ids).toEqual(['cloakbrowser']);
  });
});
