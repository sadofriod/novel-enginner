import type { Proposal } from '../domain';
import type { AgentTaskResult } from './agent-task';
import { generateManuscript } from './drafter';
import { outlineChapter } from './plot-planner';
import type { ModelProvider } from './provider';
import { generateWorldState } from './world-builder';

export interface OptimizeAgentInput {
  readonly artifactType: string;
  readonly targetId: string;
  readonly canonicalContext: string;
  readonly instructions: string;
}

export type OptimizeAgent = (input: OptimizeAgentInput, provider: ModelProvider) => Promise<AgentTaskResult>;

/**
 * Maps an artifact type to the content-producing agent that optimizes it. Only
 * artifact types with a single-file canonical draft are optimizable; entity-patch
 * types (`*-update`) and the project brief are intentionally excluded.
 */
const OPTIMIZE_AGENT_BY_ARTIFACT_TYPE: Readonly<Partial<Record<Proposal['artifactType'], OptimizeAgent>>> = {
  'chapter-manuscript': generateManuscript,
  'chapter-outline': outlineChapter,
  'volume-outline': outlineChapter,
  'world-foundation': generateWorldState,
  'story-blueprint': generateWorldState,
};

export function resolveOptimizeAgent(artifactType: Proposal['artifactType']): OptimizeAgent | undefined {
  return OPTIMIZE_AGENT_BY_ARTIFACT_TYPE[artifactType];
}
