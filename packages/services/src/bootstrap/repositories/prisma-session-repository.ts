/* eslint-disable complexity */

import type {
  BootstrapEvidence as BootstrapEvidenceRow,
  BootstrapRevision as BootstrapRevisionRow,
  BootstrapSession as BootstrapSessionRow,
  Prisma,
} from '@prisma/client';

import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '../types';
import { prisma } from '../../persistence/client';

type BootstrapRevisionRowWithSession = BootstrapRevisionRow & {
  readonly session: Pick<BootstrapSessionRow, 'sessionId'>;
};

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStrings(value: Prisma.JsonValue | null): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : undefined;
}

function toJson(value: Record<string, unknown> | readonly string[]): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toLicenseScope(license: BootstrapEvidence['license']): string {
  const scopes: Readonly<Record<BootstrapEvidence['license'], string>> = {
    'public-domain': 'permissive',
    'cc-by': 'attribution-required',
    'cc-by-sa': 'attribution-required',
    'fair-use': 'restricted',
    unknown: 'copyrighted',
  };
  return scopes[license];
}

function fromLicenseScope(scope: string): BootstrapEvidence['license'] {
  const licenses: Readonly<Record<string, BootstrapEvidence['license']>> = {
    permissive: 'public-domain',
    'attribution-required': 'cc-by',
    restricted: 'fair-use',
    copyrighted: 'unknown',
  };
  return licenses[scope] ?? 'unknown';
}

export function toBootstrapSessionCreateInput(session: BootstrapSession): Prisma.BootstrapSessionUncheckedCreateInput {
  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    ...(session.bookId === undefined ? {} : { bookId: session.bookId }),
    status: session.status,
    stage: session.currentStage,
    path: session.path,
    ...(session.currentRevisionId === undefined ? {} : { currentRevisionId: session.currentRevisionId }),
    ...(session.bookName === undefined ? {} : { bookName: session.bookName }),
    ...(session.sessionType === undefined ? {} : { sessionType: session.sessionType }),
    ...(session.completedAt === undefined ? {} : { completedAt: new Date(session.completedAt) }),
    ...(session.abandonedAt === undefined ? {} : { abandonedAt: new Date(session.abandonedAt) }),
    ...(session.failedAt === undefined ? {} : { failedAt: new Date(session.failedAt) }),
    ...(session.expiresAt === undefined ? {} : { expiresAt: new Date(session.expiresAt) }),
  };
}

export function fromBootstrapSessionRow(row: BootstrapSessionRow): BootstrapSession {
  return {
    id: row.sessionId,
    workspaceId: row.workspaceId,
    ...(row.bookId === null ? {} : { bookId: row.bookId }),
    path: row.path as BootstrapSession['path'],
    status: row.status as BootstrapSession['status'],
    currentStage: row.stage as BootstrapSession['currentStage'],
    ...(row.currentRevisionId === null ? {} : { currentRevisionId: row.currentRevisionId }),
    ...(row.bookName === null ? {} : { bookName: row.bookName }),
    ...(row.sessionType === null ? {} : { sessionType: row.sessionType }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt.toISOString() }),
    ...(row.abandonedAt === null ? {} : { abandonedAt: row.abandonedAt.toISOString() }),
    ...(row.failedAt === null ? {} : { failedAt: row.failedAt.toISOString() }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt.toISOString() }),
  };
}

export function toBootstrapRevisionCreateInput(revision: BootstrapRevision): Prisma.BootstrapRevisionUncheckedCreateInput {
  return {
    revisionId: revision.id,
    sessionId: revision.sessionId,
    stage: revision.stage,
    ...(revision.summary === undefined ? {} : { authorInput: toJson({ summary: revision.summary }) }),
    ...(revision.draft === undefined ? {} : { structuredDraft: toJson(revision.draft) }),
    ...(revision.mapping === undefined ? {} : { importMapping: toJson(revision.mapping) }),
    ...(revision.diagnostics === undefined ? {} : { diagnostics: toJson(revision.diagnostics) }),
    expiresAt: new Date(Date.parse(revision.createdAt) + 30 * 24 * 60 * 60 * 1000),
  };
}

export function fromBootstrapRevisionRow(row: BootstrapRevisionRow): BootstrapRevision {
  const authorInput = asRecord(row.authorInput);
  return {
    id: row.revisionId,
    sessionId: row.sessionId,
    stage: row.stage as BootstrapRevision['stage'],
    createdAt: row.createdAt.toISOString(),
    ...(typeof authorInput?.['summary'] === 'string' ? { summary: authorInput.summary } : {}),
    ...(asRecord(row.structuredDraft) === undefined ? {} : { draft: asRecord(row.structuredDraft) }),
    ...(asRecord(row.importMapping) === undefined ? {} : { mapping: asRecord(row.importMapping) }),
    ...(asStrings(row.diagnostics) === undefined ? {} : { diagnostics: asStrings(row.diagnostics) }),
  };
}

export function toBootstrapEvidenceCreateInput(evidence: BootstrapEvidence): Prisma.BootstrapEvidenceUncheckedCreateInput {
  if (evidence.revisionId === undefined) {
    throw new Error(`Bootstrap evidence "${evidence.id}" requires a revisionId.`);
  }
  return {
    evidenceId: evidence.id,
    revisionId: evidence.revisionId,
    url: evidence.url,
    title: evidence.title,
    collectedAt: new Date(evidence.collectedAt),
    ...(evidence.cleanedSummary === undefined ? {} : { cleanedSummary: evidence.cleanedSummary }),
    licenseScope: toLicenseScope(evidence.license),
    copyrightBoundary: evidence.copyrightBoundary,
    status: evidence.status,
  };
}

export function fromBootstrapEvidenceRow(row: BootstrapEvidenceRow, sessionId: string): BootstrapEvidence {
  return {
    id: row.evidenceId,
    sessionId,
    revisionId: row.revisionId,
    url: row.url,
    title: row.title,
    collectedAt: row.collectedAt.toISOString(),
    cleanedSummary: row.cleanedSummary ?? undefined,
    license: fromLicenseScope(row.licenseScope),
    copyrightBoundary: row.copyrightBoundary as BootstrapEvidence['copyrightBoundary'],
    status: row.status as BootstrapEvidence['status'],
  };
}

export async function saveBootstrapSession(session: BootstrapSession): Promise<BootstrapSession> {
  const data = toBootstrapSessionCreateInput(session);
  const row = await prisma.bootstrapSession.upsert({
    where: { sessionId: session.id },
    create: data,
    update: data,
  });
  return fromBootstrapSessionRow(row);
}

export async function saveBootstrapRevision(revision: BootstrapRevision): Promise<BootstrapRevision> {
  const data = toBootstrapRevisionCreateInput(revision);
  const row = await prisma.bootstrapRevision.upsert({
    where: { revisionId: revision.id },
    create: data,
    update: data,
  });
  return fromBootstrapRevisionRow(row);
}

export async function saveBootstrapSessionWithRevision(
  session: BootstrapSession,
  revision: BootstrapRevision | undefined,
): Promise<void> {
  const sessionData = toBootstrapSessionCreateInput(session);
  await prisma.$transaction(async (transaction) => {
    await transaction.bootstrapSession.upsert({
      where: { sessionId: session.id },
      create: sessionData,
      update: sessionData,
    });
    if (revision === undefined) {
      return;
    }
    const revisionData = toBootstrapRevisionCreateInput(revision);
    await transaction.bootstrapRevision.upsert({
      where: { revisionId: revision.id },
      create: revisionData,
      update: revisionData,
    });
  });
}

export async function saveBootstrapEvidence(evidence: BootstrapEvidence): Promise<BootstrapEvidence> {
  const data = toBootstrapEvidenceCreateInput(evidence);
  const row = await prisma.bootstrapEvidence.upsert({
    where: { evidenceId: evidence.id },
    create: data,
    update: data,
    include: { revision: { include: { session: true } } },
  });
  return fromBootstrapEvidenceRow(row, row.revision.session.sessionId);
}

export async function listPersistedBootstrapSessions(): Promise<readonly BootstrapSession[]> {
  const rows = await prisma.bootstrapSession.findMany({ orderBy: { updatedAt: 'desc' } });
  return rows.map(fromBootstrapSessionRow);
}

export async function findPersistedBootstrapSession(sessionId: string): Promise<BootstrapSession | undefined> {
  const row = await prisma.bootstrapSession.findUnique({ where: { sessionId } });
  return row === null ? undefined : fromBootstrapSessionRow(row);
}

export async function listPersistedBootstrapRevisions(sessionId: string): Promise<readonly BootstrapRevision[]> {
  const rows = await prisma.bootstrapRevision.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' } });
  return rows.map(fromBootstrapRevisionRow);
}

export async function listPersistedBootstrapEvidence(sessionId: string): Promise<readonly BootstrapEvidence[]> {
  const rows = await prisma.bootstrapEvidence.findMany({
    where: { revision: { sessionId } },
    include: { revision: { include: { session: true } } },
    orderBy: { collectedAt: 'desc' },
  });
  return rows.map((row) => fromBootstrapEvidenceRow(row, row.revision.session.sessionId));
}

export async function deleteExpiredAbandonedBootstrapSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.bootstrapSession.deleteMany({
    where: {
      status: 'abandoned',
      abandonedAt: { lte: cutoff },
      revisions: { none: { evidence: { some: { status: 'approved' } } } },
    },
  });
  return result.count;
}

export type { BootstrapRevisionRowWithSession };