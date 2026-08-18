import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

  test('injects the agent.md body as the role template when a workspace root is provided', async () => {
    const root = await mkdtemp('/tmp/novel-agent-task-');
    await mkdir(join(root, 'agents'), { recursive: true });
    await writeFile(
      join(root, 'agents/plot-planner.agent.md'),
      '---\nname: PlotPlanner\n---\n你是 PlotPlanner 系统角色，负责细纲。\n',
    );
    try {
      const result = await executeAgentTask({ ...input, workspaceRoot: root }, provider);
      expect(result.text).toContain('你是 PlotPlanner 系统角色，负责细纲。');
      expect(result.text).not.toContain('You are the plot-planner agent.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('falls back to the stub role line when no agent.md exists', async () => {
    const root = await mkdtemp('/tmp/novel-agent-task-');
    try {
      const result = await executeAgentTask({ ...input, workspaceRoot: root }, provider);
      expect(result.text).toContain('You are the plot-planner agent.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('injects prose hard rules and anti-AI style guidance into a chapter-manuscript task', async () => {
    const root = await mkdtemp('/tmp/novel-prose-inject-');
    await mkdir(join(root, 'agents'), { recursive: true });
    await mkdir(join(root, 'state/reviewer'), { recursive: true });
    await mkdir(join(root, 'prompts'), { recursive: true });
    await writeFile(
      join(root, 'state/reviewer/rules.json'),
      JSON.stringify({ paragraphMinChars: 50, paragraphMaxChars: 150, bannedTerms: ['仿佛', '难以言喻'] }),
    );
    await writeFile(
      join(root, 'prompts/anti-ai-voice.prompt.md'),
      '---\nname: anti-ai-voice\n---\n具象优先：用动作和细节推进叙事。\n',
    );
    try {
      const result = await executeAgentTask(
        { ...input, role: 'drafter', artifactType: 'chapter-manuscript', workspaceRoot: root },
        provider,
      );
      expect(result.text).toContain('仿佛');
      expect(result.text).toContain('难以言喻');
      expect(result.text).toContain('具象优先');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
