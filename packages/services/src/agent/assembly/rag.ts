/**
 * RAG empty-result handling, per the refined assembly contract: when retrieval
 * returns nothing, an independent economy-tier LLM call judges whether the
 * missing context is a genuinely new fact. A `new-fact` verdict yields a pending
 * Fact proposal (never written straight to canonical — it must go through the
 * proposal lifecycle and human approval).
 */
import { z } from 'zod';

import type { ModelProvider } from '../provider';

export const RAG_VERDICT_VALUES = ['new-fact', 'no-result', 'insufficient'] as const;

export type RagVerdict = (typeof RAG_VERDICT_VALUES)[number];

export const RagVerdictSchema = z
  .object({
    verdict: z.enum(RAG_VERDICT_VALUES),
    reason: z.string().optional(),
    suggestedFact: z
      .object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
        label: z.string().optional(),
        definition: z.string().optional(),
      })
      .optional(),
  })
  .readonly();

export type RagVerdictResult = z.infer<typeof RagVerdictSchema>;

export interface FactProposalSuggestion {
  /** Stable id suggestion, finalized by the proposal lifecycle. */
  readonly factId: string;
  readonly label: string;
  readonly definition: string;
  readonly sourceQuery: string;
}

export class RagVerdictParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RagVerdictParseError';
  }
}

/** Parses the LLM verdict response with strict validation. */
export function parseRagVerdict(raw: string): RagVerdictResult {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new RagVerdictParseError(`RAG verdict must be valid JSON: ${message}`);
  }
  try {
    return RagVerdictSchema.parse(value);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new RagVerdictParseError(`RAG verdict failed validation: ${message}`);
  }
}

function formatVerdictPrompt(query: string): string {
  return [
    'A context retrieval returned no results for the query below.',
    'Judge whether the missing context is a genuinely new fact of the story world.',
    'Return ONLY JSON: {"verdict":"new-fact|no-result|insufficient","reason":"...",',
    '"suggestedFact":{"id":"kebab-case-latin-id","label":"...","definition":"..."}}',
    'Use "new-fact" only when the world genuinely lacks this fact; otherwise "no-result".',
    '',
    `Query: ${query}`,
  ].join('\n');
}

/**
 * Runs the independent economy-tier verdict call. Degrades to `no-result` on any
 * failure so the main workflow is never blocked by the judgment step.
 */
export async function classifyMissingContext(
  provider: ModelProvider,
  query: string,
): Promise<RagVerdictResult> {
  try {
    const completion = await provider.complete({
      tier: 'economy',
      system: 'You are a world-consistency judge for a novel writing workflow. Return JSON only.',
      prompt: formatVerdictPrompt(query),
    });
    return parseRagVerdict(completion.text);
  } catch {
    return { verdict: 'no-result', reason: 'classify-unavailable' };
  }
}

/** Builds a pending fact proposal suggestion when the verdict is `new-fact`. */
export function buildFactProposalSuggestion(
  verdict: RagVerdictResult,
  sourceQuery: string,
): FactProposalSuggestion | undefined {
  if (verdict.verdict !== 'new-fact') {
    return undefined;
  }
  return buildSuggestedFact(verdict, sourceQuery);
}

function buildSuggestedFact(verdict: RagVerdictResult, sourceQuery: string): FactProposalSuggestion {
  const { id, label, definition } = verdict.suggestedFact ?? {};
  return {
    factId: id ?? 'fact-pending',
    label: label ?? sourceQuery,
    definition: definition ?? '',
    sourceQuery,
  };
}

export type RagRetriever = (query: string, limit?: number) => Promise<readonly string[]>;

export interface RagContextResult {
  readonly results: readonly string[];
  readonly verdict: RagVerdict | undefined;
  readonly factProposal: FactProposalSuggestion | undefined;
}

/**
 * Retrieves context; on an empty result, classifies whether the missing context
 * is a new fact and, if so, produces a pending fact proposal.
 */
export async function resolveRagContext(
  provider: ModelProvider,
  retriever: RagRetriever,
  query: string,
  limit?: number,
): Promise<RagContextResult> {
  const results = await retriever(query, limit);
  if (results.length > 0) {
    return { results, verdict: undefined, factProposal: undefined };
  }
  const verdict = await classifyMissingContext(provider, query);
  return {
    results,
    verdict: verdict.verdict,
    factProposal: buildFactProposalSuggestion(verdict, query),
  };
}
