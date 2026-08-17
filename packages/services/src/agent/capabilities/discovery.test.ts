import { describe, expect, test } from 'bun:test';

import { discoverCapabilitiesFromAllSources } from './discovery';

describe('discoverCapabilitiesFromAllSources', () => {
  test('discovers MCP servers from mcp.json', () => {
    const result = discoverCapabilitiesFromAllSources({
      mcpConfig: { servers: { cloakbrowser: {}, github: {} } },
    });

    expect(result).toEqual([
      { id: 'cloakbrowser', type: 'mcp', source: 'mcp.json' },
      { id: 'github', type: 'mcp', source: 'mcp.json' },
    ]);
  });

  test('discovers skills, agents, and prompt packs from file lists', () => {
    const result = discoverCapabilitiesFromAllSources({
      skillFiles: ['prompts/world-builder.md', 'agents/plot-planner.md'],
      agentFiles: ['agents/drafter.md'],
      promptPackFiles: ['prompts/editing-pack.md'],
    });

    expect(result).toEqual([
      { id: 'world-builder', type: 'skill', source: 'prompts/world-builder.md' },
      { id: 'plot-planner', type: 'skill', source: 'agents/plot-planner.md' },
      { id: 'drafter', type: 'agent', source: 'agents/drafter.md' },
      { id: 'editing-pack', type: 'prompt-pack', source: 'prompts/editing-pack.md' },
    ]);
  });

  test('deduplicates the same capability id discovered from multiple files', () => {
    const result = discoverCapabilitiesFromAllSources({
      skillFiles: ['skills/world-builder.md', 'skills/world-builder.markdown'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('world-builder');
  });

  test('deduplicates across source kinds by type:id', () => {
    const result = discoverCapabilitiesFromAllSources({
      agentFiles: ['agents/drafter.md', 'agents/drafter.agent.md'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'drafter', type: 'agent', source: 'agents/drafter.md' });
  });

  test('drops ids that reduce to an empty string', () => {
    const result = discoverCapabilitiesFromAllSources({
      skillFiles: ['###.md'],
    });

    expect(result).toEqual([]);
  });

  test('returns an empty list when there are no sources', () => {
    expect(discoverCapabilitiesFromAllSources({})).toEqual([]);
  });
});
