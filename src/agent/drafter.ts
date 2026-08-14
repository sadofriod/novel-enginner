import type { ModelProvider } from './provider';
import { executeAgentTask, type AgentTaskInput, type AgentTaskResult } from './agent-task';

export type DrafterInput = Omit<AgentTaskInput, 'role'>;

export function generateManuscript(
  input: DrafterInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  return executeAgentTask({ ...input, role: 'drafter' }, provider);
}
