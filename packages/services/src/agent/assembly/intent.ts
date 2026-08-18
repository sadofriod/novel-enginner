/**
 * Intent-driven assembly step 1: an LLM analyzes the task and returns a
 * structured intent that decides which process tools, reviewer rules, and RAG
 * retrieval are needed for the final prompt (per the refined prompt-assembly
 * contract: LLM analyzes intent first, then tools + rules + RAG are assembled).
 *
 * Intent analysis is fail-fast: a non-JSON or schema-violating response throws
 * `IntentAnalysisError` instead of silently degrading to static assembly.
 */
import { z } from 'zod';

import type { ModelProvider } from '../provider';

export const INTENT_TYPE_VALUES = ['generate', 'optimize', 'review', 'research', 'update-state'] as const;

export type IntentType = (typeof INTENT_TYPE_VALUES)[number];

export const AgentIntentSchema = z
  .object({
    intentType: z.enum(INTENT_TYPE_VALUES),
    tools: z.array(z.string().trim().min(1)).readonly().default([]),
    rules: z.array(z.string().trim().min(1)).readonly().default([]),
    needRag: z.boolean().default(false),
    ragQuery: z.string().trim().min(1).optional(),
  })
  .readonly();

export type AgentIntent = z.infer<typeof AgentIntentSchema>;

export class IntentAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentAnalysisError';
  }
}

export interface IntentAnalysisInput {
  readonly role: string;
  readonly artifactType: string;
  readonly instructions: string;
  readonly canonicalContext: string;
}

/** Renders the intent-analysis prompt. Exposed for tests and prompt audits. */
export function formatIntentPrompt(input: IntentAnalysisInput): string {
  return [
    'Analyze the intent of this novel-writing task and return ONLY a JSON object.',
    'Shape: {"intentType":"...","tools":[...],"rules":[...],"needRag":true,"ragQuery":"..."}',
    `intentType ∈ ${INTENT_TYPE_VALUES.join('|')}.`,
    'tools ∈ process tools available to the role (rag-search, graph-query, read-canonical, cloakbrowser).',
    'rules ∈ reviewer rule bundle ids (banned-terms, paragraph-length, motivation-drift, pacing, emotion-curve).',
    'Set needRag=false when the canonical context already covers the facts needed for the task.',
    '',
    `Role: ${input.role}`,
    `Artifact type: ${input.artifactType}`,
    `Instructions: ${input.instructions}`,
    `Canonical context:\n${input.canonicalContext}`,
  ].join('\n');
}

/** Parses the LLM intent response with strict validation. Throws on any failure. */
export function parseAgentIntent(raw: string): AgentIntent {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new IntentAnalysisError(`Intent analysis must return valid JSON: ${message}`);
  }
  try {
    return AgentIntentSchema.parse(value);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new IntentAnalysisError(`Intent analysis JSON failed validation: ${message}`);
  }
}

/** Runs the intent-analysis LLM call and returns the validated intent. */
export async function analyzeIntent(
  provider: ModelProvider,
  input: IntentAnalysisInput,
): Promise<AgentIntent> {
  const completion = await provider.complete({
    tier: 'economy',
    system: 'You are a task-intent analyzer for a novel writing workflow. Return JSON only.',
    prompt: formatIntentPrompt(input),
  });
  return parseAgentIntent(completion.text);
}
