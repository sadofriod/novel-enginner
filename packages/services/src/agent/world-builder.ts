import type { ModelProvider } from './provider';
import { executeAgentTask, type AgentTaskInput, type AgentTaskResult } from './agent-task';

export type WorldBuilderInput = Omit<AgentTaskInput, 'role'>;

export function generateWorldState(
  input: WorldBuilderInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  return executeAgentTask({ ...input, role: 'world-builder' }, provider);
}
