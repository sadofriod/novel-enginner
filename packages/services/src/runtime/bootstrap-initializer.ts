import type { Proposal } from '../domain';
import { findPersistedCanonicalDraft } from '../persistence/operations';
import { validateProjectBrief, type ProjectBrief } from '../bootstrap/domain/canonical-artifacts';
import { buildBootstrapInitialFiles } from '../bootstrap/domain/book-init';
import { buildDefaultLocation } from '../bootstrap/domain/stage-artifacts';
import { getNextStageId } from '../bootstrap/stages/stage-defs';
import type { BootstrapSession } from '../bootstrap/types';
import { commitCanonicalBundle } from '../workspace/canonical-commit';
import { withCanonicalCommitLane } from '../workspace/canonical-commit-lane';
import { readCanonicalWorkspaceFiles } from '../workspace/file-watcher';
import { parseCanonicalMarkdown, serializeCanonicalMarkdown } from '../workspace/markdown';
import { reSyncState, type WorkspaceSnapshot } from '../workspace/sync-engine';
import { createApprovedCanonicalDraft } from './canonical-draft';
import type { CanonicalDraft } from './store';
import type { RunEvent, RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import type { CreateApiServerOptions } from './api-server/types';

export interface FinalizeBootstrapArtifactApprovalInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly runId: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly workspaceRoot: string;
  readonly artifactType: Proposal['artifactType'];
  readonly proposal: Proposal;
  readonly options: CreateApiServerOptions;
}

export interface FinalizeBootstrapArtifactApprovalResult {
  readonly reason?: string;
  readonly snapshot?: WorkspaceSnapshot;
  readonly events: readonly RunEvent[];
}

export const BOOTSTRAP_ARTIFACT_TYPES: ReadonlySet<Proposal['artifactType']> = new Set([
  'project-brief',
  'world-foundation',
  'story-blueprint',
  'volume-outline',
  'chapter-outline',
]);

const STAGE_BY_ARTIFACT_TYPE: Readonly<Partial<Record<Proposal['artifactType'], BootstrapSession['currentStage']>>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  'volume-outline': 'volume-outlines',
  'chapter-outline': 'chapter-outline-batch',
};

export function isBootstrapArtifactType(artifactType: Proposal['artifactType'] | undefined): boolean {
  return artifactType !== undefined && BOOTSTRAP_ARTIFACT_TYPES.has(artifactType);
}

/** True when a new-book bootstrap session is awaiting approval at the stage this artifact drives. */
export function hasBootstrapApprovalSession(store: RuntimeStore, bookId: string, artifactType: Proposal['artifactType'] | undefined): boolean {
  if (artifactType === undefined) {
    return false;
  }
  const stage = STAGE_BY_ARTIFACT_TYPE[artifactType];
  return stage !== undefined && findBootstrapSessionAtStage(store, bookId, stage) !== undefined;
}

function readProjectBriefFromDraft(content: string): ProjectBrief {
  return validateProjectBrief(parseCanonicalMarkdown(content).frontmatter);
}

function findBootstrapSessionAtStage(store: RuntimeStore, bookId: string, stage: BootstrapSession['currentStage']): BootstrapSession | undefined {
  return store.listBootstrapSessions().find((session) => (
    session.bookId === bookId
    && session.path === 'new-book'
    && session.currentStage === stage
    && session.status === 'awaiting-approval'
  ));
}

function chapterOneApproved(store: RuntimeStore): boolean {
  const proposal = store.getActiveProposal('chapter-outline', 'chapter-0001-outline');
  return proposal?.status === 'approved' || proposal?.status === 'override-approved';
}

type LoadBriefResult = { readonly brief: ProjectBrief } | { readonly reason: string };

function persistenceEnabled(): boolean {
  return process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
}

async function resolveCanonicalDraft(input: FinalizeBootstrapArtifactApprovalInput) {
  const inMemory = input.store.getCanonicalDraft(input.proposal.proposalId);
  if (inMemory !== undefined) {
    return inMemory;
  }
  if (input.options.loadCanonicalDraft !== undefined) {
    return input.options.loadCanonicalDraft(input.proposal.proposalId);
  }
  if (persistenceEnabled()) {
    return findPersistedCanonicalDraft(input.proposal.proposalId);
  }
  return undefined;
}

function parseApprovedBrief(draft: CanonicalDraft, proposal: Proposal): LoadBriefResult {
  try {
    const validated = createApprovedCanonicalDraft(draft, proposal);
    return { brief: readProjectBriefFromDraft(validated.content) };
  } catch (cause) {
    return { reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function loadApprovedProjectBrief(input: FinalizeBootstrapArtifactApprovalInput): Promise<LoadBriefResult> {
  const draft = await resolveCanonicalDraft(input);
  if (draft === undefined) {
    return { reason: `canonical draft not found for proposal ${input.proposal.proposalId}` };
  }
  return parseApprovedBrief(draft, input.proposal);
}

type CommitWorkspaceResult = { readonly snapshot: WorkspaceSnapshot } | { readonly reason: string };

async function commitInitialWorkspace(input: FinalizeBootstrapArtifactApprovalInput, brief: ProjectBrief): Promise<CommitWorkspaceResult> {
  const files = buildBootstrapInitialFiles(brief);
  const currentSnapshotId = input.store.getLastKnownSnapshot(input.workspaceId)?.snapshotId ?? 'snap-0001';
  const commit = await withCanonicalCommitLane(input.bookId, () => commitCanonicalBundle({
    workspaceRoot: input.workspaceRoot,
    files: [
      { relativePath: files.book.path, content: files.book.content },
      { relativePath: files.projectBrief.path, content: files.projectBrief.content },
    ],
    workspaceValidity: 'clean',
    proposalSnapshotId: currentSnapshotId,
    currentSnapshotId,
  }));
  if (!commit.committed) {
    return { reason: commit.reason };
  }

  const reconciled = reSyncState([
    { path: files.book.path, content: files.book.content },
    { path: files.projectBrief.path, content: files.projectBrief.content },
  ]);
  input.store.setLastKnownSnapshot(input.workspaceId, reconciled.snapshot);
  input.store.setWorkspaceValidity(input.workspaceId, 'clean');
  return { snapshot: reconciled.snapshot };
}

async function reSyncWorkspaceFromDisk(input: FinalizeBootstrapArtifactApprovalInput): Promise<WorkspaceSnapshot> {
  const files = await readCanonicalWorkspaceFiles(input.workspaceRoot);
  const reconciled = reSyncState(files, input.store.getLastKnownSnapshot(input.workspaceId));
  input.store.setLastKnownSnapshot(input.workspaceId, reconciled.snapshot);
  input.store.setWorkspaceValidity(input.workspaceId, 'clean');
  return reconciled.snapshot;
}

async function commitFile(input: FinalizeBootstrapArtifactApprovalInput, relativePath: string, content: string): Promise<{ readonly reason?: string }> {
  const currentSnapshotId = input.store.getLastKnownSnapshot(input.workspaceId)?.snapshotId ?? 'snap-0001';
  const commit = await withCanonicalCommitLane(input.bookId, () => commitCanonicalBundle({
    workspaceRoot: input.workspaceRoot,
    files: [{ relativePath, content }],
    workspaceValidity: 'clean',
    proposalSnapshotId: currentSnapshotId,
    currentSnapshotId,
  }));
  if (!commit.committed) {
    return { reason: commit.reason };
  }
  return {};
}

async function commitBootstrapArtifact(input: FinalizeBootstrapArtifactApprovalInput, draft: CanonicalDraft): Promise<CommitWorkspaceResult> {
  const result = await commitFile(input, draft.relativePath, draft.content);
  if (result.reason !== undefined) {
    return { reason: result.reason };
  }
  const snapshot = await reSyncWorkspaceFromDisk(input);
  return { snapshot };
}

/** Commits the default location once, so chapter scene skeletons resolve during the chain. */
async function ensureDefaultLocation(input: FinalizeBootstrapArtifactApprovalInput): Promise<void> {
  if (input.store.getLastKnownSnapshot(input.workspaceId)?.entities.has('state/locations/location-main.md')) {
    return;
  }
  const result = await commitFile(input, 'state/locations/location-main.md', serializeCanonicalMarkdown({ frontmatter: buildDefaultLocation() }));
  if (result.reason !== undefined) {
    throw new Error(`Cannot establish default location: ${result.reason}`);
  }
  await reSyncWorkspaceFromDisk(input);
}

function committedEvent(input: FinalizeBootstrapArtifactApprovalInput, emittedAt: string): RunEvent {
  return {
    type: 'artifact.canonical-committed',
    runId: input.runId,
    emittedAt,
    data: { proposalId: input.proposal.proposalId, status: 'approved' },
  };
}

function advanceToStage(input: FinalizeBootstrapArtifactApprovalInput, session: BootstrapSession, emittedAt: string): RunEvent[] {
  const events: RunEvent[] = [committedEvent(input, emittedAt)];
  const nextStage = getNextStageId('new-book', session.currentStage);
  if (nextStage === undefined) {
    return events;
  }
  input.store.upsertBootstrapSession({ ...session, status: 'advancing', currentStage: nextStage, updatedAt: emittedAt });
  events.push(
    { type: 'bootstrap.session.updated', runId: input.runId, emittedAt, data: { sessionId: session.id, revisionId: session.currentRevisionId } },
    { type: 'bootstrap.stage.changed', runId: input.runId, emittedAt, data: { sessionId: session.id, stage: nextStage } },
  );
  return events;
}

function markReadyToWrite(input: FinalizeBootstrapArtifactApprovalInput, session: BootstrapSession, emittedAt: string): RunEvent[] {
  const events: RunEvent[] = [committedEvent(input, emittedAt)];
  input.store.upsertBootstrapSession({ ...session, status: 'ready-to-write', updatedAt: emittedAt });
  events.push(
    { type: 'bootstrap.session.updated', runId: input.runId, emittedAt, data: { sessionId: session.id, revisionId: session.currentRevisionId } },
    { type: 'bootstrap.ready-to-write', runId: input.runId, emittedAt, data: { sessionId: session.id } },
  );
  return events;
}

function isChapterOneReady(input: FinalizeBootstrapArtifactApprovalInput): boolean {
  return input.artifactType === 'chapter-outline' && chapterOneApproved(input.store);
}

function needsDefaultLocation(input: FinalizeBootstrapArtifactApprovalInput): boolean {
  return input.artifactType === 'volume-outline';
}

async function advanceBootstrapSessionAfterApproval(input: FinalizeBootstrapArtifactApprovalInput): Promise<RunEvent[]> {
  const emittedAt = new Date().toISOString();
  const stage = STAGE_BY_ARTIFACT_TYPE[input.artifactType];
  if (stage === undefined) {
    return [committedEvent(input, emittedAt)];
  }
  const session = findBootstrapSessionAtStage(input.store, input.bookId, stage);
  if (session === undefined) {
    return [committedEvent(input, emittedAt)];
  }
  if (isChapterOneReady(input)) {
    return markReadyToWrite(input, session, emittedAt);
  }
  if (needsDefaultLocation(input)) {
    await ensureDefaultLocation(input);
  }
  return advanceToStage(input, session, emittedAt);
}

/**
 * Completes the approval of a bootstrap artifact (project-brief, world-foundation,
 * story-blueprint, volume-outline, or chapter-outline): commits the canonical file,
 * re-syncs the workspace into a clean baseline, and advances the bootstrap session —
 * reaching `ready-to-write` once the first chapter outline is approved
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3).
 */
async function finalizeSingleFileBootstrapArtifact(input: FinalizeBootstrapArtifactApprovalInput): Promise<FinalizeBootstrapArtifactApprovalResult> {
  const draft = await resolveCanonicalDraft(input);
  if (draft === undefined) {
    return { reason: `canonical draft not found for proposal ${input.proposal.proposalId}`, events: [] };
  }
  let validated: CanonicalDraft;
  try {
    validated = createApprovedCanonicalDraft(draft, input.proposal);
  } catch (cause) {
    return { reason: cause instanceof Error ? cause.message : String(cause), events: [] };
  }
  const commitResult = await commitBootstrapArtifact(input, validated);
  if ('reason' in commitResult) {
    return { reason: commitResult.reason, events: [] };
  }
  const events = await advanceBootstrapSessionAfterApproval(input);
  return { snapshot: commitResult.snapshot, events };
}

/**
 * Completes the approval of a bootstrap artifact (project-brief, world-foundation,
 * story-blueprint, volume-outline, or chapter-outline): commits the canonical file,
 * re-syncs the workspace into a clean baseline, and advances the bootstrap session —
 * reaching `ready-to-write` once the first chapter outline is approved
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3).
 */
export async function finalizeBootstrapArtifactApproval(input: FinalizeBootstrapArtifactApprovalInput): Promise<FinalizeBootstrapArtifactApprovalResult> {
  if (input.artifactType !== 'project-brief') {
    return finalizeSingleFileBootstrapArtifact(input);
  }
  const briefResult = await loadApprovedProjectBrief(input);
  if ('reason' in briefResult) {
    return { reason: briefResult.reason, events: [] };
  }
  const commitResult = await commitInitialWorkspace(input, briefResult.brief);
  if ('reason' in commitResult) {
    return { reason: commitResult.reason, events: [] };
  }
  const events = await advanceBootstrapSessionAfterApproval(input);
  return { snapshot: commitResult.snapshot, events };
}
