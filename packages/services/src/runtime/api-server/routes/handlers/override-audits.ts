import { findOverrideAudit } from '../../../../persistence/operations';
import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface OverrideAuditHandlers {
  readonly handleGetOverrideAudit: (overrideAuditId: string) => Promise<Response>;
}

export function createOverrideAuditHandlers(deps: RouteHandlerDeps): OverrideAuditHandlers {
  const { logger } = deps;

  async function handleGetOverrideAudit(overrideAuditId: string): Promise<Response> {
    logger.debug({ overrideAuditId }, 'Fetching override audit');
    if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test') {
      logger.debug('Override audit persistence unavailable');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Override audit persistence is unavailable.' }, 404);
    }
    const audit = await findOverrideAudit(overrideAuditId);
    if (audit === undefined) {
      logger.warn({ overrideAuditId }, 'Override audit not found');
      return jsonResponse({ status: 'rejected', code: 'not-found', message: 'Unknown override audit.' }, 404);
    }
    logger.info({ overrideAuditId }, 'Override audit retrieved');
    return jsonResponse(audit);
  }

  return { handleGetOverrideAudit };
}
