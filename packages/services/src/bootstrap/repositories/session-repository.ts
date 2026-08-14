/**
 * Repository for persisting and querying BootstrapSession, BootstrapRevision, and BootstrapEvidence.
 * Handles 30-day cleanup per doc 11.6.
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import type {
  BootstrapSessionData,
  BootstrapRevisionData,
  BootstrapEvidenceData,
  BootstrapStatus,
  BootstrapStage,
  BootstrapPath,
  LicenseScope,
} from '../types';

export class BootstrapSessionRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new bootstrap session.
   */
  async createSession(
    workspaceId: string,
    path: BootstrapPath,
  ): Promise<BootstrapSessionData> {
    const sessionId = uuid();
    const session = await this.prisma.bootstrapSession.create({
      data: {
        sessionId,
        workspaceId,
        status: 'drafting',
        stage: path === 'new-book' ? 'market-research' : 'import-scan',
        path,
      },
    });
    return this.mapSessionData(session);
  }

  /**
   * Retrieve a session by sessionId.
   */
  async getSession(sessionId: string): Promise<BootstrapSessionData | null> {
    const session = await this.prisma.bootstrapSession.findUnique({
      where: { sessionId },
    });
    return session ? this.mapSessionData(session) : null;
  }

  /**
   * List all sessions for a workspace.
   */
  async listSessionsByWorkspace(workspaceId: string): Promise<BootstrapSessionData[]> {
    const sessions = await this.prisma.bootstrapSession.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => this.mapSessionData(s));
  }

  /**
   * Update session status and stage.
   */
  async updateSession(
    sessionId: string,
    updates: {
      status?: BootstrapStatus;
      stage?: BootstrapStage;
      bookId?: string;
      currentRevisionId?: string;
      completedAt?: Date;
      abandonedAt?: Date;
      failedAt?: Date;
    },
  ): Promise<BootstrapSessionData> {
    const session = await this.prisma.bootstrapSession.update({
      where: { sessionId },
      data: updates,
    });
    return this.mapSessionData(session);
  }

  /**
   * Create a new revision for a session.
   */
  async createRevision(
    sessionId: string,
    stage: BootstrapStage,
    data: {
      authorInput?: unknown;
      structuredDraft?: unknown;
      importMapping?: unknown;
      diagnostics?: unknown;
    },
  ): Promise<BootstrapRevisionData> {
    const revisionId = uuid();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const createData: Record<string, unknown> = {
      revisionId,
      sessionId,
      stage,
      expiresAt,
    };

    if (data.authorInput !== undefined) {
      createData.authorInput = data.authorInput;
    }
    if (data.structuredDraft !== undefined) {
      createData.structuredDraft = data.structuredDraft;
    }
    if (data.importMapping !== undefined) {
      createData.importMapping = data.importMapping;
    }
    if (data.diagnostics !== undefined) {
      createData.diagnostics = data.diagnostics;
    }

    const revision = await this.prisma.bootstrapRevision.create({
      data: createData as Parameters<PrismaClient['bootstrapRevision']['create']>[0]['data'],
    });
    return this.mapRevisionData(revision);
  }

  /**
   * Retrieve a revision by revisionId.
   */
  async getRevision(revisionId: string): Promise<BootstrapRevisionData | null> {
    const revision = await this.prisma.bootstrapRevision.findUnique({
      where: { revisionId },
    });
    return revision ? this.mapRevisionData(revision) : null;
  }

  /**
   * List all revisions for a session.
   */
  async listRevisionsBySession(sessionId: string): Promise<BootstrapRevisionData[]> {
    const revisions = await this.prisma.bootstrapRevision.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    return revisions.map((r) => this.mapRevisionData(r));
  }

  /**
   * Create evidence for a revision.
   */
  async createEvidence(
    revisionId: string,
    url: string,
    title: string,
    licenseScope: LicenseScope,
    cleanedSummary?: string,
  ): Promise<BootstrapEvidenceData> {
    const evidenceId = uuid();
    const createData: Record<string, unknown> = {
      evidenceId,
      revisionId,
      url,
      title,
      licenseScope,
    };

    if (cleanedSummary !== undefined) {
      createData.cleanedSummary = cleanedSummary;
    }

    const evidence = await this.prisma.bootstrapEvidence.create({
      data: createData as Parameters<PrismaClient['bootstrapEvidence']['create']>[0]['data'],
    });
    return this.mapEvidenceData(evidence);
  }

  /**
   * Retrieve evidence by evidenceId.
   */
  async getEvidence(evidenceId: string): Promise<BootstrapEvidenceData | null> {
    const evidence = await this.prisma.bootstrapEvidence.findUnique({
      where: { evidenceId },
    });
    return evidence ? this.mapEvidenceData(evidence) : null;
  }

  /**
   * List all evidence for a revision.
   */
  async listEvidenceByRevision(revisionId: string): Promise<BootstrapEvidenceData[]> {
    const evidence = await this.prisma.bootstrapEvidence.findMany({
      where: { revisionId },
      orderBy: { createdAt: 'asc' },
    });
    return evidence.map((e) => this.mapEvidenceData(e));
  }

  /**
   * Clean up abandoned sessions and their evidence after 30 days.
   * Per doc 11.6: "丢弃会话进入 `abandoned`，其 revision 与 evidence 保留 30 天供恢复，之后级联清理"
   */
  async cleanupExpiredSessions(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Delete evidence for expired revisions
    await this.prisma.bootstrapEvidence.deleteMany({
      where: {
        revision: {
          expiresAt: {
            lt: thirtyDaysAgo,
          },
        },
      },
    });

    // Delete expired revisions
    const deletedRevisions = await this.prisma.bootstrapRevision.deleteMany({
      where: {
        expiresAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    // Delete abandoned sessions that are also old
    const deletedSessions = await this.prisma.bootstrapSession.deleteMany({
      where: {
        abandonedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });


    return deletedSessions.count + deletedRevisions.count;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nullToUndefined(value: any): any {
    return value || undefined;
  }

  private mapSessionData(raw: BootstrapSession): BootstrapSessionData {
    return {
      sessionId: raw.sessionId,
      workspaceId: raw.workspaceId,
      bookId: this.nullToUndefined(raw.bookId),
      status: raw.status as BootstrapStatus,
      stage: raw.stage as BootstrapStage,
      path: raw.path as BootstrapPath,
      currentRevisionId: this.nullToUndefined(raw.currentRevisionId),
      completedAt: this.nullToUndefined(raw.completedAt),
      abandonedAt: this.nullToUndefined(raw.abandonedAt),
      failedAt: this.nullToUndefined(raw.failedAt),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapRevisionData(raw: BootstrapRevision): BootstrapRevisionData {
    return {
      revisionId: raw.revisionId,
      sessionId: raw.sessionId,
      stage: raw.stage as BootstrapStage,
      authorInput: raw.authorInput as unknown,
      structuredDraft: raw.structuredDraft as unknown,
      importMapping: raw.importMapping as unknown,
      diagnostics: raw.diagnostics as unknown,
      createdAt: raw.createdAt,
      expiresAt: raw.expiresAt,
    };
  }

  private mapEvidenceData(raw: BootstrapEvidence): BootstrapEvidenceData {
    return {
      evidenceId: raw.evidenceId,
      revisionId: raw.revisionId,
      url: raw.url,
      title: raw.title,
      collectedAt: raw.collectedAt,
      cleanedSummary: raw.cleanedSummary || undefined,
      licenseScope: raw.licenseScope as LicenseScope,
      createdAt: raw.createdAt,
    };
  }
}

// Import types from Prisma
import type { BootstrapSession, BootstrapRevision, BootstrapEvidence } from '@prisma/client';


