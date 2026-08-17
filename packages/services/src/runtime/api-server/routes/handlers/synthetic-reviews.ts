import { ReviewerResultSchema } from '../../../../domain/schemas/review';
import { applySyntheticReviewOutcome, isDownstreamAutoFlowBlocked, type SyntheticReviewOutcome } from '../../../synthetic-review-gate';
import { jsonResponse, readSyncBody } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface SyntheticReviewHandlers {
  readonly handleSyntheticReviewOutcome: (request: Request) => Promise<Response>;
}

type OutcomePayload = { readonly artifactType: string; readonly targetId: string; readonly outcome: SyntheticReviewOutcome };
type OutcomeParseResult = { readonly ok: true; readonly payload: OutcomePayload } | { readonly ok: false; readonly message: string };

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

function parseOutcome(body: Record<string, unknown>, artifactType: string, targetId: string): OutcomePayload | undefined {
  const status = body['status'];
  if (status === 'passed') {
    return { artifactType, targetId, outcome: { status: 'passed' } };
  }
  if (status !== 'blocked') {
    return undefined;
  }
  const parsed = ReviewerResultSchema.safeParse(body['reviewerResult']);
  if (!parsed.success) {
    return undefined;
  }
  return { artifactType, targetId, outcome: { status: 'blocked', reviewerResult: parsed.data } };
}

function parseOutcomePayload(body: Record<string, unknown>): OutcomeParseResult {
  const artifactType = readString(body, 'artifactType');
  const targetId = readString(body, 'targetId');
  if (artifactType === undefined || targetId === undefined) {
    return { ok: false, message: 'Invalid synthetic review outcome payload.' };
  }
  const payload = parseOutcome(body, artifactType, targetId);
  return payload === undefined ? { ok: false, message: 'Invalid synthetic review outcome payload.' } : { ok: true, payload };
}

export function createSyntheticReviewHandlers(deps: RouteHandlerDeps): SyntheticReviewHandlers {
  const { store, logger } = deps;

  async function handleSyntheticReviewOutcome(request: Request): Promise<Response> {
    const body = await readSyncBody(request);
    const parsed = parseOutcomePayload(body);
    if (!parsed.ok) {
      logger.warn({ body }, parsed.message);
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: parsed.message }, 400);
    }
    const { artifactType, targetId, outcome } = parsed.payload;
    applySyntheticReviewOutcome(store, artifactType, targetId, outcome);
    logger.info({ artifactType, targetId, status: outcome.status }, 'Synthetic review outcome applied');
    return jsonResponse({ status: 'accepted', artifactType, targetId, blocked: isDownstreamAutoFlowBlocked(store, artifactType, targetId) });
  }

  return { handleSyntheticReviewOutcome };
}
