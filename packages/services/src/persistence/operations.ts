/* eslint-disable complexity */

/**
 * Prisma-backed CRUD operations for the runtime/audit persistence layer.
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.8,
 *  docs/architecture/modules/10-v1-execution-plan.md Phase 4)
 *
 * Canonical state (books, volumes, characters, …) lives in the filesystem and is never
 * duplicated here. Only the runtime/audit layer (proposals, runs, reviewer results,
 * override audits, capability snapshots) is persisted via Prisma.
 */
import { Prisma } from '@prisma/client';
import type { Proposal, ReviewerResult, OverrideAudit } from '../domain';
import { ReviewerResultSchema } from '../domain/schema';
import type { ProposalArtifactType } from '../domain/values';
import type { CanonicalDraft, CommandRecord, RunRecord } from '../runtime/store';
import { validateCanonicalDraftForProposal } from '../runtime/canonical-draft';

import { prisma } from './client';
import {
  fromProposalRow,
  toOverrideAuditCreateInput,
  toProposalCreateInput,
  toReviewerResultCreateInput,
  type ProposalRow,
} from './mappers';

export * from './audit-operations';

function toPrismaJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

export async function persistCommand(
  workspaceId: string,
  bookId: string,
  command: CommandRecord,
): Promise<void> {
  await prisma.command.upsert({
    where: { commandId: command.commandId },
    create: {
      commandId: command.commandId,
      runId: command.runId,
      workspaceId,
      bookId,
      idempotencyKey: command.idempotencyKey,
      status: command.status,
      acceptedAt: new Date(command.acceptedAt),
    },
    update: {
      status: command.status,
    },
  });
}

export async function persistRun(
  run: RunRecord,
  commandIntent: string,
  requestedBy: string,
  idempotencyKey: string,
  basedOnCanonicalVersion?: string,
): Promise<void> {
  await prisma.run.upsert({
    where: { runId: run.runId },
    create: {
      runId: run.runId,
      workspaceId: run.workspaceId,
      bookId: run.bookId,
      commandIntent,
      ...(run.artifactType !== undefined ? { artifactType: run.artifactType } : {}),
      ...(run.targetId !== undefined ? { targetId: run.targetId } : {}),
      status: run.status,
      nextExpectedState: run.nextExpectedState,
      requestedBy,
      idempotencyKey,
      ...(basedOnCanonicalVersion !== undefined ? { basedOnCanonicalVersion } : {}),
    },
    update: {
      status: run.status,
      nextExpectedState: run.nextExpectedState,
      ...(run.artifactType !== undefined ? { artifactType: run.artifactType } : {}),
      ...(run.targetId !== undefined ? { targetId: run.targetId } : {}),
      ...(basedOnCanonicalVersion !== undefined ? { basedOnCanonicalVersion } : {}),
    },
  });
}

export async function updatePersistedRunStatus(input: {
  readonly runId: string;
  readonly status: string;
  readonly nextExpectedState: string;
  readonly driftReason?: string;
}): Promise<void> {
  await prisma.run.update({
    where: { runId: input.runId },
    data: {
      status: input.status,
      nextExpectedState: input.nextExpectedState,
      ...(input.driftReason !== undefined ? { driftReason: input.driftReason } : {}),
      ...(input.status === 'completed' || input.status === 'aborted' || input.status === 'external-failed'
        ? { completedAt: new Date() }
        : {}),
    },
  });
}

export interface PersistRunStepInput {
  readonly runId: string;
  readonly stepKey: string;
  readonly sequence: number;
  readonly status: string;
  readonly isCheckpoint?: boolean;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorReason?: string;
  readonly completedAt?: Date;
}

export async function persistRunStep(input: PersistRunStepInput): Promise<void> {
  await prisma.runStep.upsert({
    where: { runId_sequence: { runId: input.runId, sequence: input.sequence } },
    create: {
      runId: input.runId,
      stepKey: input.stepKey,
      sequence: input.sequence,
      status: input.status,
      isCheckpoint: input.isCheckpoint ?? false,
      ...(input.input !== undefined ? { input: toPrismaJsonInput(input.input) } : {}),
      ...(input.output !== undefined ? { output: toPrismaJsonInput(input.output) } : {}),
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    },
    update: {
      stepKey: input.stepKey,
      status: input.status,
      isCheckpoint: input.isCheckpoint ?? false,
      ...(input.input !== undefined ? { input: toPrismaJsonInput(input.input) } : {}),
      ...(input.output !== undefined ? { output: toPrismaJsonInput(input.output) } : {}),
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    },
  });
}

export interface PersistedRunStep {
  readonly runId: string;
  readonly stepKey: string;
  readonly sequence: number;
  readonly status: string;
  readonly isCheckpoint: boolean;
  readonly input: unknown;
  readonly output: unknown;
  readonly errorReason?: string;
  readonly completedAt?: string;
}

export async function listPersistedRunSteps(runId: string): Promise<readonly PersistedRunStep[]> {
  const rows = await prisma.runStep.findMany({ where: { runId }, orderBy: { sequence: 'asc' } });
  return rows.map((row) => ({
    runId: row.runId,
    stepKey: row.stepKey,
    sequence: row.sequence,
    status: row.status,
    isCheckpoint: row.isCheckpoint,
    input: row.input,
    output: row.output,
    ...(row.errorReason !== null ? { errorReason: row.errorReason } : {}),
    ...(row.completedAt !== null ? { completedAt: row.completedAt.toISOString() } : {}),
  }));
}

export async function findPersistedRun(runId: string): Promise<RunRecord | undefined> {
  const row = await prisma.run.findUnique({ where: { runId } });
  if (row === null) {
    return undefined;
  }
  const command = await prisma.command.findUnique({ where: { runId } });
  return {
    runId: row.runId,
    commandId: command?.commandId ?? '',
    workspaceId: row.workspaceId,
    bookId: row.bookId,
    ...(row.artifactType !== null
      ? { artifactType: row.artifactType as NonNullable<RunRecord['artifactType']> }
      : {}),
    ...(row.targetId !== null ? { targetId: row.targetId } : {}),
    status: row.status,
    nextExpectedState: row.nextExpectedState ?? 'unknown',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export async function listPersistedRuns(): Promise<readonly RunRecord[]> {
  const rows = await prisma.run.findMany({ orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(async (row) => {
    const command = await prisma.command.findUnique({ where: { runId: row.runId } });
    return {
      runId: row.runId,
      commandId: command?.commandId ?? '',
      workspaceId: row.workspaceId,
      bookId: row.bookId,
      ...(row.artifactType === null ? {} : { artifactType: row.artifactType as NonNullable<RunRecord['artifactType']> }),
      ...(row.targetId === null ? {} : { targetId: row.targetId }),
      status: row.status,
      nextExpectedState: row.nextExpectedState ?? 'unknown',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }));
}

export async function findPersistedCommandByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string,
): Promise<CommandRecord | undefined> {
  const row = await prisma.command.findUnique({
    where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
  });
  if (row === null) {
    return undefined;
  }
  return {
    commandId: row.commandId,
    runId: row.runId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    acceptedAt: row.acceptedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function persistProposal(
  workspaceId: string,
  bookId: string,
  proposal: Proposal,
): Promise<void> {
  const data = toProposalCreateInput(workspaceId, bookId, proposal);
  await prisma.proposal.upsert({
    where: { proposalId: data.proposalId },
    create: data,
    update: {
      status: data.status,
      ...(data.latestReviewResultId !== undefined ? { latestReviewResultId: data.latestReviewResultId } : {}),
      ...(data.overrideAuditId !== undefined ? { overrideAuditId: data.overrideAuditId } : {}),
      ...(data.supersedesProposalId !== undefined ? { supersedesProposalId: data.supersedesProposalId } : {}),
      ...(data.bundledDiffRefs !== undefined ? { bundledDiffRefs: data.bundledDiffRefs } : {}),
    },
  });
}

export async function findProposal(proposalId: string): Promise<Proposal | undefined> {
  const row = await prisma.proposal.findUnique({ where: { proposalId } });
  return row === null ? undefined : fromProposalRow(row as unknown as ProposalRow);
}

export async function listActiveProposalsForBook(
  workspaceId: string,
  bookId: string,
): Promise<readonly Proposal[]> {
  const rows = await prisma.proposal.findMany({
    where: {
      workspaceId,
      bookId,
      status: {
        notIn: ['rejected', 'superseded', 'exported', 'deleted'],
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row: unknown) => fromProposalRow(row as unknown as ProposalRow));
}

export async function findActiveProposalForTarget(
  workspaceId: string,
  bookId: string,
  artifactType: ProposalArtifactType,
  targetId: string,
): Promise<Proposal | undefined> {
  const row = await prisma.proposal.findFirst({
    where: {
      workspaceId,
      bookId,
      artifactType,
      targetId,
      status: { notIn: ['rejected', 'superseded', 'exported', 'deleted'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return row === null ? undefined : fromProposalRow(row as unknown as ProposalRow);
}

// ---------------------------------------------------------------------------
// Proposal drafts
// ---------------------------------------------------------------------------

export async function persistCanonicalDraft(input: {
  readonly draft: CanonicalDraft;
  readonly proposal: Pick<Proposal, 'artifactType' | 'targetId'>;
}): Promise<void> {
  const validatedDraft = validateCanonicalDraftForProposal(input.draft, input.proposal);
  await prisma.proposalDraft.upsert({
    where: { proposalId: validatedDraft.proposalId },
    create: validatedDraft,
    update: {
      relativePath: validatedDraft.relativePath,
      content: validatedDraft.content,
    },
  });
}

export async function findPersistedCanonicalDraft(proposalId: string): Promise<CanonicalDraft | undefined> {
  const draft = await prisma.proposalDraft.findUnique({ where: { proposalId } });
  if (draft === null) {
    return undefined;
  }
  return {
    proposalId: draft.proposalId,
    relativePath: draft.relativePath,
    content: draft.content,
  };
}

// ---------------------------------------------------------------------------
// Reviewer results
// ---------------------------------------------------------------------------

export async function persistReviewerResult(
  reviewResultId: string,
  proposalId: string,
  result: ReviewerResult,
): Promise<void> {
  const data = toReviewerResultCreateInput(reviewResultId, proposalId, result);
  await prisma.reviewerResult.upsert({
    where: { reviewResultId },
    create: data,
    update: {
      approved: data.approved,
      hardFailures: data.hardFailures,
      dimensionScores: data.dimensionScores,
      totalScore: data.totalScore,
      rewriteDirectives: data.rewriteDirectives,
      overrideEligible: data.overrideEligible,
    },
  });
}

export async function persistReviewerResultAndLinkProposal(
  reviewResultId: string,
  proposalId: string,
  result: ReviewerResult,
): Promise<void> {
  const data = toReviewerResultCreateInput(reviewResultId, proposalId, result);
  await prisma.$transaction([
    prisma.reviewerResult.upsert({
      where: { reviewResultId },
      create: data,
      update: {
        approved: data.approved,
        hardFailures: data.hardFailures,
        dimensionScores: data.dimensionScores,
        totalScore: data.totalScore,
        rewriteDirectives: data.rewriteDirectives,
        overrideEligible: data.overrideEligible,
      },
    }),
    prisma.proposal.update({
      where: { proposalId },
      data: { latestReviewResultId: reviewResultId },
    }),
  ]);
}

export async function findPersistedReviewerResult(reviewResultId: string): Promise<ReviewerResult | undefined> {
  const row = await prisma.reviewerResult.findUnique({ where: { reviewResultId } });
  if (row === null) {
    return undefined;
  }
  return ReviewerResultSchema.parse({
    approved: row.approved,
    hardFailures: row.hardFailures,
    dimensionScores: row.dimensionScores,
    totalScore: row.totalScore,
    rewriteDirectives: row.rewriteDirectives,
    overrideEligible: row.overrideEligible,
  });
}

// ---------------------------------------------------------------------------
// Override audits
// ---------------------------------------------------------------------------

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
