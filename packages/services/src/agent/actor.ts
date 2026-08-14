import type { ModelProvider } from './provider';
import { executeAgentTask, type AgentTaskInput, type AgentTaskResult } from './agent-task';

export type ActorInput = Omit<AgentTaskInput, 'role'>;

export function validateCharacterActions(
  input: ActorInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  return executeAgentTask({ ...input, role: 'actor' }, provider);
}
