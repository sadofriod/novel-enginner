import { z } from 'zod';

import {
  APPROVAL_MODE_VALUES,
  COMMAND_INTENT_VALUES,
  PROPOSAL_ARTIFACT_TYPE_VALUES,
  PROPOSAL_STATUS_VALUES,
  SYSTEM_TASK_TYPE_VALUES,
} from '../values';

import { EntityVersionRefSchema, PositiveIntegerSchema, StableIdSchema } from './common';

export const ProposalSchema = z
  .object({
    proposalId: StableIdSchema,
    artifactType: z.enum(PROPOSAL_ARTIFACT_TYPE_VALUES),
    targetId: StableIdSchema,
    status: z.enum(PROPOSAL_STATUS_VALUES),
    intent: z.enum(COMMAND_INTENT_VALUES),
    basedOnCanonicalVersion: StableIdSchema,
    entityVersionRefs: z.array(EntityVersionRefSchema).readonly().optional(),
    parentRunId: StableIdSchema,
    supersedesProposalId: StableIdSchema.optional(),
    latestReviewResultId: StableIdSchema.optional(),
    overrideAuditId: StableIdSchema.optional(),
    bundledDiffRefs: z.array(StableIdSchema).readonly().optional(),
  })
  .readonly();

export const BudgetOverrideSchema = z
  .object({
    targetWordCount: PositiveIntegerSchema.optional(),
  })
  .readonly();

export const CommandEnvelopeSchema = z
  .object({
    workspaceId: StableIdSchema,
    bookId: StableIdSchema,
    artifactType: z.enum(PROPOSAL_ARTIFACT_TYPE_VALUES).optional(),
    systemTaskType: z.enum(SYSTEM_TASK_TYPE_VALUES).optional(),
    targetId: StableIdSchema.optional(),
    intent: z.enum(COMMAND_INTENT_VALUES),
    requestedBy: StableIdSchema,
    approvalMode: z.enum(APPROVAL_MODE_VALUES),
    budgetOverride: BudgetOverrideSchema.optional(),
    idempotencyKey: StableIdSchema,
  })
  .readonly();
