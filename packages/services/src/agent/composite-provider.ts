import type { ModelTier } from './model-config';
import type {
  ModelCompletionRequest,
  ModelCompletionResult,
  ModelProvider,
  ModelToolCallRequest,
  ModelToolCallResult,
} from './provider';

/** A concrete sub-provider serving one tier. */
export interface TierSubProvider {
  readonly provider: ModelProvider;
  readonly model: string;
}

/**
 * Wraps per-tier sub-providers behind the single `ModelProvider` seam. Tiers may
 * resolve to different providers (multi-provider support) while callers keep using
 * one provider handle.
 */
export function buildCompositeProvider(
  subProviders: Readonly<Record<ModelTier, TierSubProvider>>,
): ModelProvider {
  return {
    providerId: 'composite',
    providerVersion: '2026-v1',
    resolveModelId: (tier) => subProviders[tier].model,
    complete: async (request: ModelCompletionRequest): Promise<ModelCompletionResult> =>
      subProviders[request.tier].provider.complete(request),
    completeWithTools: async (request: ModelToolCallRequest): Promise<ModelToolCallResult> => {
      const sub = subProviders[request.tier].provider;
      if (sub.completeWithTools === undefined) {
        const result = await sub.complete({
          tier: request.tier,
          prompt: request.prompt,
          ...(request.system === undefined ? {} : { system: request.system }),
        });
        return {
          text: result.text,
          modelId: result.modelId,
          providerVersion: result.providerVersion,
          toolCalls: 0,
        };
      }
      return sub.completeWithTools(request);
    },
  };
}
