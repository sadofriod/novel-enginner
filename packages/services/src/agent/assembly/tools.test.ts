import { describe, expect, test } from 'bun:test';

import {
  executeProcessTool,
  findToolDefinition,
  PROCESS_TOOL_NAMES,
  resolveToolDescriptions,
  ToolExecutionError,
  type ToolExecutionDeps,
} from './tools';

const deps: ToolExecutionDeps = {
  ragSearch: async (input) => `rag:${input.query}:${input.limit ?? 5}`,
  graphQuery: async (input) => `graph:${input.query}:${input.limit ?? 20}`,
  readCanonical: async (input) => `canonical:${input.artifactType}:${input.targetId}`,
};

describe('process tool registry', () => {
  test('exposes exactly the three V1 process tools', () => {
    expect(PROCESS_TOOL_NAMES).toEqual(['rag-search', 'graph-query', 'read-canonical']);
  });

  test('finds a known tool definition by name', () => {
    expect(findToolDefinition('rag-search')?.description.length).toBeGreaterThan(0);
    expect(findToolDefinition('unknown-tool')).toBeUndefined();
  });

  test('resolves only known tool descriptions and drops unknown ids', () => {
    const tools = resolveToolDescriptions(['rag-search', 'not-a-tool', 'read-canonical']);
    expect(tools.map((tool) => tool.name)).toEqual(['rag-search', 'read-canonical']);
  });
});

describe('executeProcessTool', () => {
  test('dispatches rag-search to the ragSearch port with validated args', async () => {
    await expect(executeProcessTool('rag-search', { query: '码头', limit: 3 }, deps)).resolves.toBe('rag:码头:3');
  });

  test('dispatches graph-query and read-canonical to their ports', async () => {
    await expect(executeProcessTool('graph-query', { query: '伏笔' }, deps)).resolves.toBe('graph:伏笔:20');
    await expect(
      executeProcessTool('read-canonical', { artifactType: 'chapter-outline', targetId: 'chapter-0001-outline' }, deps),
    ).resolves.toBe('canonical:chapter-outline:chapter-0001-outline');
  });

  test('rejects an unknown tool name', async () => {
    await expect(executeProcessTool('mystery-tool', {}, deps)).rejects.toThrow(ToolExecutionError);
  });

  test('rejects arguments that violate the tool parameter schema', async () => {
    await expect(executeProcessTool('rag-search', { query: '' }, deps)).rejects.toThrow(ToolExecutionError);
  });
});
