import type { OverrideAudit } from '../domain';

import { prisma } from './client';
import { toOverrideAuditCreateInput } from './mappers';

export async function persistOverrideAudit(
  overrideAuditId: string,
  proposalId: string,
  audit: OverrideAudit,
): Promise<void> {
  const data = toOverrideAuditCreateInput(overrideAuditId, proposalId, audit);
  await prisma.overrideAudit.upsert({
    where: { overrideAuditId },
    create: data,
    update: {},
  });
}

export async function findOverrideAudit(overrideAuditId: string): Promise<OverrideAudit | undefined> {
  const row = await prisma.overrideAudit.findUnique({ where: { overrideAuditId } });
  if (row === null) {
    return undefined;
  }
  return {
    overrideReason: row.overrideReason,
    overrideBy: row.overrideBy,
    relatedRunId: row.relatedRunId,
    failedChecks: row.failedChecks as unknown as OverrideAudit['failedChecks'],
    scoreSnapshot: row.scoreSnapshot as unknown as OverrideAudit['scoreSnapshot'],
    timestamp: row.timestamp.toISOString(),
  };
}
