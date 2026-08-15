import type { Proposal, StableId } from '../domain/schema';
import type { ProposalArtifactType, WorkspaceValidity } from '../domain/values';

import {
  attemptCanonicalCommit,
  createProposal,
  decideApproval,
  exportDraft,
  rejectProposal,
  requeueAfterWorkspaceRecovery,
  type ApprovalDecisionResult,
  type CommitAttemptResult,
  type CreateProposalResult,
  type ProposalRegistry,
} from './proposal-lifecycle';

/**
 * v1 workflow skeletons (docs/architecture/modules/10-v1-execution-plan.md
 * §10.7): one skeleton per proposable artifact type that is actually
 * reachable through `intent: propose | regenerate` today. Each skeleton is a
 * thin, artifact-specific façade over the shared, pure proposal-lifecycle
 * rules in `./proposal-lifecycle` — it intentionally does not reimplement
 * supersede / approval / commit-blocked state machines per artifact type.
 *
 * These are step-orchestration skeletons, not the full Inngest workflow
 * wiring (Phase 4/5 infra): they define the sequence of pure decisions a
 * workflow step function should call, so the actual Inngest step
 * implementation stays a thin adapter over this module.
 */

export interface ProposalWorkflowStepInput {
  readonly proposal: Proposal;
  readonly registry: ProposalRegistry;
}

export interface ProposalWorkflowStepResult extends CreateProposalResult {
  readonly artifactType: ProposalArtifactType;
}

function createArtifactProposal(
  expectedArtifactType: ProposalArtifactType,
  input: ProposalWorkflowStepInput,
): ProposalWorkflowStepResult {
  if (input.proposal.artifactType !== expectedArtifactType) {
    throw new Error(
      `Expected proposal for artifactType "${expectedArtifactType}" but received "${input.proposal.artifactType}".`,
    );
  }
  const result = createProposal(input);
  return { ...result, artifactType: expectedArtifactType };
}

/** Shared workflow surface every artifact-specific skeleton exposes. */
export interface ArtifactWorkflow {
  readonly artifactType: ProposalArtifactType;
  /** `propose` / `regenerate` step: creates (and supersedes as needed). */
  propose(input: ProposalWorkflowStepInput): ProposalWorkflowStepResult;
  /** `approve` / `override-approve` step. */
  approve(
    proposal: Proposal,
    currentCanonicalVersion: StableId,
    isOverride: boolean,
    overrideAuditId?: StableId,
  ): ApprovalDecisionResult;
  /** `reject` step. */
  reject(proposal: Proposal): Proposal;
  /** Canonical-commit step, gated on workspace validity. */
  commit(proposal: Proposal, workspaceValidity: WorkspaceValidity): CommitAttemptResult;
  /** Re-queues a `commit-blocked` / `waiting-sync` proposal once the workspace is clean again. */
  recoverFromBlocked(proposal: Proposal, workspaceValidity: WorkspaceValidity): Proposal;
  /** `export-draft` terminal step. */
  exportDraft(proposal: Proposal): Proposal;
}

function buildArtifactWorkflow(artifactType: ProposalArtifactType): ArtifactWorkflow {
  return {
    artifactType,
    propose: (input) => createArtifactProposal(artifactType, input),
    approve: (proposal, currentCanonicalVersion, isOverride, overrideAuditId) =>
      decideApproval({
        proposal,
        currentCanonicalVersion,
        isOverride,
        ...(overrideAuditId !== undefined ? { overrideAuditId } : {}),
      }),
    reject: rejectProposal,
    commit: attemptCanonicalCommit,
    recoverFromBlocked: requeueAfterWorkspaceRecovery,
    exportDraft,
  };
}

/**
 * `chapter-outline` workflow skeleton
 * (docs/architecture/modules/10-v1-execution-plan.md §10.7).
 */
export const chapterOutlineWorkflow: ArtifactWorkflow = buildArtifactWorkflow('chapter-outline');

/**
 * `project-brief` workflow skeleton.
 */
export const projectBriefWorkflow: ArtifactWorkflow = buildArtifactWorkflow('project-brief');

/**
 * `world-foundation` workflow skeleton.
 */
export const worldFoundationWorkflow: ArtifactWorkflow = buildArtifactWorkflow('world-foundation');

/**
 * `story-blueprint` workflow skeleton.
 */
export const storyBlueprintWorkflow: ArtifactWorkflow = buildArtifactWorkflow('story-blueprint');

/**
 * `chapter-manuscript` workflow skeleton
 * (docs/architecture/modules/10-v1-execution-plan.md §10.7).
 */
export const chapterManuscriptWorkflow: ArtifactWorkflow = buildArtifactWorkflow('chapter-manuscript');

/**
 * `volume-outline` workflow skeleton
 * (docs/architecture/modules/10-v1-execution-plan.md §10.7).
 */
export const volumeOutlineWorkflow: ArtifactWorkflow = buildArtifactWorkflow('volume-outline');

/**
 * `world-change` workflow skeleton
 * (docs/architecture/modules/10-v1-execution-plan.md §10.7).
 */
export const worldChangeWorkflow: ArtifactWorkflow = buildArtifactWorkflow('world-change');

export const characterUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('character-update');
export const factionUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('faction-update');
export const locationUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('location-update');
export const techRuleUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('tech-rule-update');
export const factUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('fact-update');
export const relationshipUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('relationship-update');
export const resourceUpdateWorkflow: ArtifactWorkflow = buildArtifactWorkflow('resource-update');

const ARTIFACT_WORKFLOWS: ReadonlyMap<ProposalArtifactType, ArtifactWorkflow> = new Map([
  ['project-brief', projectBriefWorkflow],
  ['world-foundation', worldFoundationWorkflow],
  ['story-blueprint', storyBlueprintWorkflow],
  ['chapter-outline', chapterOutlineWorkflow],
  ['chapter-manuscript', chapterManuscriptWorkflow],
  ['volume-outline', volumeOutlineWorkflow],
  ['world-change', worldChangeWorkflow],
  ['character-update', characterUpdateWorkflow],
  ['faction-update', factionUpdateWorkflow],
  ['location-update', locationUpdateWorkflow],
  ['tech-rule-update', techRuleUpdateWorkflow],
  ['fact-update', factUpdateWorkflow],
  ['relationship-update', relationshipUpdateWorkflow],
  ['resource-update', resourceUpdateWorkflow],
]);

/** Resolves the workflow skeleton registered for a given artifact type, if any. */
export function resolveArtifactWorkflow(artifactType: ProposalArtifactType): ArtifactWorkflow | undefined {
  return ARTIFACT_WORKFLOWS.get(artifactType);
}
