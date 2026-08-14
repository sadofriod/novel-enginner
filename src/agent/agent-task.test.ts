import { describe, expect, test } from 'bun:test';

import { executeAgentTask, type AgentTaskInput } from './agent-task';
import { outlineChapter, type PlotPlannerInput } from './plot-planner';
import { type ModelProvider } from './provider';

const input: AgentTaskInput = {
  role: 'plot-planner',
  artifactType: 'chapter-outline',
  targetId: 'chapter-001-outline',
  canonicalContext: 'Volume goal: resolve the first clue.',
  instructions: 'Create a concise scene outline.',
  capabilityIds: ['cloakbrowser'],
};

const plotPlannerInput: PlotPlannerInput = {
  artifactType: input.artifactType,
  targetId: input.targetId,
  canonicalContext: input.canonicalContext,
  instructions: input.instructions,
  ...(input.capabilityIds === undefined ? {} : { capabilityIds: input.capabilityIds }),
};

const provider: ModelProvider = {
  providerId: 'test',
  providerVersion: 'test-v1',
  resolveModelId: (tier) => `test-${tier}`,
  complete: async (request) => ({
    text: `result:${request.prompt}`,
    modelId: 'test-flagship',
    providerVersion: 'test-v1',
  }),
};

describe('agent task execution', () => {
  test('assembles layered context and selects the role tier', async () => {
    const result = await executeAgentTask(input, provider);
    expect(result.role).toBe('plot-planner');
    expect(result.modelId).toBe('test-flagship');
    expect(result.text).toContain('Canonical context:');
    expect(result.text).toContain('Available capabilities: cloakbrowser');
  });

  test('role adapters preserve the artifact contract', async () => {
    const result = await outlineChapter(plotPlannerInput, provider);
    expect(result.artifactType).toBe('chapter-outline');
    expect(result.targetId).toBe('chapter-001-outline');
  });
});
