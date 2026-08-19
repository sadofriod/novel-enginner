import { afterEach, describe, expect, test } from 'bun:test';

import type { OverrideAudit } from '../domain';

import { prisma } from './client';
import { findOverrideAudit, persistOverrideAudit } from './override-audits';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];
const createdProposalIds: string[] = [];
const createdAuditIds: string[] = [];

const overrideAuditId = `audit-override-test-${Date.now().toString(36)}`;
const proposalId = `proposal-override-test-${Date.now().toString(36)}`;
const runId = `run-override-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-override-test-${Date.now().toString(36)}`;
const bookId = 'book-override-test';

const audit: OverrideAudit = {
  overrideReason: '紧急修正',
  overrideBy: 'user-1',
  relatedRunId: runId,
  failedChecks: [{ code: 'weak-payoff-release', message: '高潮释放不足' }],
  scoreSnapshot: {
    approved: false,
    hardFailures: [{ code: 'weak-payoff-release', message: '高潮释放不足' }],
    dimensionScores: {
      antiAiVoice: 90,
      webFictionPacing: 88,
      emotionCurve: 85,
      characterConsistency: 90,
      settingConsistency: 90,
      clueCausality: 90,
      readabilityLayout: 90,
      languageTexture: 90,
    },
    totalScore: 40,
    rewriteDirectives: [],
    overrideEligible: true,
  },
  timestamp: '2026-01-01T00:00:00.000Z',
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.overrideAudit.deleteMany({ where: { overrideAuditId: { in: createdAuditIds } } });
  await prisma.proposal.deleteMany({ where: { proposalId: { in: createdProposalIds } } });
  await prisma.run.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('override audit persistence', () => {
  test('round-trips an override audit', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await prisma.run.create({
      data: {
        runId,
        workspaceId,
        bookId,
        commandIntent: 'propose',
        status: 'completed',
        requestedBy: 'author-test',
        idempotencyKey: `idem-run-${Date.now().toString(36)}`,
      },
    });
    createdProposalIds.push(proposalId);
    await prisma.proposal.create({
      data: {
        proposalId,
        workspaceId,
        bookId,
        artifactType: 'chapter-outline',
        targetId: 'chapter-override-test',
        status: 'pending-approval',
        intent: 'propose',
        origin: 'generated',
        basedOnCanonicalVersion: 'snap-1',
        parentRunId: runId,
      },
    });
    createdAuditIds.push(overrideAuditId);
    await persistOverrideAudit(overrideAuditId, proposalId, audit);

    const restored = await findOverrideAudit(overrideAuditId);

    expect(restored?.overrideBy).toBe('user-1');
    expect(restored?.failedChecks[0]?.code).toBe('weak-payoff-release');
  });
});
