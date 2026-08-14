import type { ModelProvider } from './provider';
import { executeAgentTask, type AgentTaskInput, type AgentTaskResult } from './agent-task';

export type PlotPlannerInput = Omit<AgentTaskInput, 'role'>;

export function outlineChapter(
  input: PlotPlannerInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  return executeAgentTask({ ...input, role: 'plot-planner' }, provider);
}
