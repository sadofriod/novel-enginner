import type { Prisma } from '@prisma/client';

import {
  CapabilityRegistrationStateSchema,
  OverrideAuditSchema,
  ProposalSchema,
  ReviewerResultSchema,
  type CapabilityRegistrationState,
  type OverrideAudit,
  type Proposal,
  type ReviewerResult,
} from '../domain';

/**
 * Mapping helpers between the canonical domain contracts (src/domain) and the
 * Prisma persistence rows for the runtime/audit layer (proposals, reviewer
 * results, override audits). These helpers are intentionally the single
 * place that knows how domain shapes map onto row shapes, so the schema in
 * prisma/schema.prisma never needs to duplicate domain validation rules.
 */

export interface ProposalRow {
  proposalId: string;
  workspaceId: string;
  bookId: string;
  artifactType: string;
  targetId: string;
  status: string;
  intent: string;
  origin: string;
  basedOnCanonicalVersion: string;
  entityVersionRefs: Prisma.JsonValue | null;
  parentRunId: string;
  supersedesProposalId: string | null;
  latestReviewResultId: string | null;
  overrideAuditId: string | null;
  bundledDiffRefs: Prisma.JsonValue | null;
}

function optionalJsonField<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [K in Key]?: Value } {
  return value !== undefined ? ({ [key]: value } as { [K in Key]?: Value }) : {};
}

export function toProposalCreateInput(
  workspaceId: string,
  bookId: string,
  proposal: Proposal,
): Prisma.ProposalUncheckedCreateInput {
  const validated = ProposalSchema.parse(proposal);

  return {
    proposalId: validated.proposalId,
    workspaceId,
    bookId,
    artifactType: validated.artifactType,
    targetId: validated.targetId,
    status: validated.status,
    intent: validated.intent,
    origin: validated.origin,
    basedOnCanonicalVersion: validated.basedOnCanonicalVersion,
    parentRunId: validated.parentRunId,
    supersedesProposalId: validated.supersedesProposalId ?? null,
    latestReviewResultId: validated.latestReviewResultId ?? null,
    overrideAuditId: validated.overrideAuditId ?? null,
    ...optionalJsonField('entityVersionRefs', validated.entityVersionRefs),
    ...optionalJsonField('bundledDiffRefs', validated.bundledDiffRefs),
  };
}

function proposalRowJsonFields(row: ProposalRow) {
  return {
    ...optionalJsonField('entityVersionRefs', row.entityVersionRefs ?? undefined),
    ...optionalJsonField('bundledDiffRefs', row.bundledDiffRefs ?? undefined),
  };
}

function proposalRowStringRefFields(row: ProposalRow) {
  return {
    ...optionalJsonField('supersedesProposalId', row.supersedesProposalId ?? undefined),
    ...optionalJsonField('latestReviewResultId', row.latestReviewResultId ?? undefined),
    ...optionalJsonField('overrideAuditId', row.overrideAuditId ?? undefined),
  };
}

export function fromProposalRow(row: ProposalRow): Proposal {
  return ProposalSchema.parse({
    proposalId: row.proposalId,
    artifactType: row.artifactType,
    targetId: row.targetId,
    status: row.status,
    origin: row.origin,
    intent: row.intent,
    basedOnCanonicalVersion: row.basedOnCanonicalVersion,
    parentRunId: row.parentRunId,
    ...proposalRowJsonFields(row),
    ...proposalRowStringRefFields(row),
  });
}

export function toReviewerResultCreateInput(
  reviewResultId: string,
  proposalId: string,
  reviewerResult: ReviewerResult,
): Prisma.ReviewerResultUncheckedCreateInput {
  const validated = ReviewerResultSchema.parse(reviewerResult);

  return {
    reviewResultId,
    proposalId,
    approved: validated.approved,
    hardFailures: validated.hardFailures,
    dimensionScores: validated.dimensionScores,
    totalScore: validated.totalScore,
    rewriteDirectives: validated.rewriteDirectives,
    overrideEligible: validated.overrideEligible,
  };
}

export function toCapabilityDiscoverySnapshotCreateInput(
  snapshotId: string,
  workspaceId: string,
  state: CapabilityRegistrationState,
): Prisma.CapabilityDiscoverySnapshotUncheckedCreateInput {
  const validated = CapabilityRegistrationStateSchema.parse(state);

  return {
    snapshotId,
    workspaceId,
    status: validated.status,
    ...optionalJsonField('capabilityId', validated.capabilityId),
    ...optionalJsonField('source', validated.source),
    ...optionalJsonField('details', validated.details),
  };
}

export function toOverrideAuditCreateInput(
  overrideAuditId: string,
  proposalId: string,
  overrideAudit: OverrideAudit,
): Prisma.OverrideAuditUncheckedCreateInput {
  const validated = OverrideAuditSchema.parse(overrideAudit);

  return {
    overrideAuditId,
    proposalId,
    overrideReason: validated.overrideReason,
    overrideBy: validated.overrideBy,
    relatedRunId: validated.relatedRunId,
    failedChecks: validated.failedChecks,
    scoreSnapshot: validated.scoreSnapshot,
    timestamp: new Date(validated.timestamp),
  };
}
