import type { ModelProvider } from './provider';
import { executeAgentTask, type AgentTaskInput, type AgentTaskResult } from './agent-task';

export type UpdateActorInput = Omit<AgentTaskInput, 'role'>;

export function commitMutableStateChanges(
  input: UpdateActorInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  return executeAgentTask({ ...input, role: 'update-actor' }, provider);
}
