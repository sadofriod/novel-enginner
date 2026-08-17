/* eslint-disable complexity */
import type { CommandEnvelope } from '../../../domain';
import type { WorkspaceValidity } from '../../../domain/values';
import { applyBootstrapCommand } from '../../bootstrap-command-handler';
import { type CommandResult, validateCommandEnvelope } from '../../command-handler';
import { findPersistedCommandByIdempotencyKey, findPersistedRun, persistCommand, persistRun, updatePersistedRunStatus } from '../../../persistence/operations';
import { RunEventBus } from '../../event-bus';
import { RuntimeStore } from '../../store';
import type { CreateApiServerOptions } from '../types';
import { confirmImport } from '../../../bootstrap/import/confirm-import';
import type { ImportMapping } from '../../../bootstrap/import/import-mapper';
import { transitionBootstrapSession } from '../../../bootstrap/state-machine/state-machine';

export function shouldDispatchToInngest(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env['NODE_ENV'] !== 'test' && (env['INNGEST_EVENT_KEY']?.trim() ?? '') !== '';
}

export function createPersistAcceptedCommand(input: CreateApiServerOptions['persistAcceptedCommand']): CreateApiServerOptions['persistAcceptedCommand'] {
  return input ?? (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test'
    ? async (envelope, command, run) => { await persistCommand(envelope.workspaceId, envelope.bookId, command); await persistRun(run, envelope.intent, envelope.requestedBy, envelope.idempotencyKey); }
    : undefined);
}

export function createLoadPersistedCommand(input: CreateApiServerOptions['loadPersistedCommand']): CreateApiServerOptions['loadPersistedCommand'] {
  return input ?? (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test'
    ? async (workspaceId, idempotencyKey) => { const command = await findPersistedCommandByIdempotencyKey(workspaceId, idempotencyKey); if (command === undefined) return undefined; const run = await findPersistedRun(command.runId); return run === undefined ? { command } : { command, run: { ...run, commandId: command.commandId } }; }
    : undefined);
}

export function createDispatchCommand(input: CreateApiServerOptions['dispatchCommand']): CreateApiServerOptions['dispatchCommand'] {
  return input ?? (shouldDispatchToInngest() ? async (envelope, run, canonicalVersion) => { const { dispatchCommandToInngest } = await import('../../../workflow/inngest-client'); await dispatchCommandToInngest(envelope, canonicalVersion, run.runId); } : undefined);
}

export function createDispatchSyntheticReview(input: CreateApiServerOptions['dispatchSyntheticReview']): CreateApiServerOptions['dispatchSyntheticReview'] {
  return input ?? (shouldDispatchToInngest() ? async (review) => { const { dispatchSyntheticReviewToInngest } = await import('../../../workflow/inngest-client'); await dispatchSyntheticReviewToInngest(review); } : undefined);
}

export interface FinalizeAcceptedCommandContext {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly persistAcceptedCommand: CreateApiServerOptions['persistAcceptedCommand'];
  readonly commandWasKnown: boolean;
  readonly dispatchCommand: CreateApiServerOptions['dispatchCommand'];
  readonly payload: Record<string, unknown>;
  readonly options: CreateApiServerOptions;
}

export async function restorePersistedCommand(validation: ReturnType<typeof validateCommandEnvelope>, store: RuntimeStore, eventBus: RunEventBus, loader: CreateApiServerOptions['loadPersistedCommand']): Promise<boolean> {
  if (!('ok' in validation) || loader === undefined) return false;
  const persisted = await loader(validation.envelope.workspaceId, validation.envelope.idempotencyKey);
  if (persisted === undefined) return false;
  store.saveCommand(persisted.command);
  if (persisted.run === undefined) return true;
  store.saveRun(persisted.run);
  if (eventBus.history(persisted.run.runId).length > 0) return true;
  eventBus.publish({ type: 'command.accepted', runId: persisted.run.runId, emittedAt: persisted.command.acceptedAt, data: { commandId: persisted.command.commandId } });
  eventBus.publish({ type: 'run.started', runId: persisted.run.runId, emittedAt: persisted.command.acceptedAt, data: { commandId: persisted.command.commandId } });
  return true;
}

/**
 * Finishes a `propose`/`regenerate` whose artifact content was authored in the web
 * console (per-artifact-type form): applies it synchronously, publishing the failure
 * as a recoverable event, or falls back to dispatching to the Agent workflow when
 * the payload carries no author-authored content.
 */
async function finalizeAuthorProposedArtifact(
  validation: ReturnType<typeof validateCommandEnvelope>,
  result: CommandResult,
  context: FinalizeAcceptedCommandContext,
): Promise<void> {
  if (!('ok' in validation) || result.status !== 'accepted') {
    return;
  }
  if (validation.envelope.intent !== 'propose' && validation.envelope.intent !== 'regenerate') {
    return;
  }
  const artifactType = validation.envelope.artifactType;
  const targetId = validation.envelope.targetId;
  if (artifactType === undefined || targetId === undefined) {
    return;
  }
  const { tryApplyAuthorProposedArtifact } = await import('../../author-proposal');
  let authored: import('../../author-proposal').AuthorProposedArtifactResult | undefined;
  try {
    authored = await tryApplyAuthorProposedArtifact(context.payload, {
      store: context.store,
      eventBus: context.eventBus,
      runId: result.runId,
      workspaceId: validation.envelope.workspaceId,
      bookId: validation.envelope.bookId,
      artifactType,
      targetId,
      intent: validation.envelope.intent === 'regenerate' ? 'regenerate' : 'propose',
      options: context.options,
    });
  } catch (cause) {
    context.eventBus.publish({ type: 'run.step.failed', runId: result.runId, emittedAt: new Date().toISOString(), data: { reason: cause instanceof Error ? cause.message : String(cause) } });
    return;
  }
  if (authored !== undefined) {
    for (const event of authored.events) context.eventBus.publish(event);
    return;
  }
  const run = context.store.getRun(result.runId);
  if (run !== undefined && context.dispatchCommand !== undefined) {
    await context.dispatchCommand(validation.envelope, run, context.store.getLastKnownSnapshot(validation.envelope.workspaceId)?.snapshotId);
  }
}

export async function finalizeAcceptedCommand(validation: ReturnType<typeof validateCommandEnvelope>, result: CommandResult, context: FinalizeAcceptedCommandContext): Promise<void> {
  if (!('ok' in validation) || result.status !== 'accepted') return;
  const command = context.store.getCommand(result.commandId);
  const run = context.store.getRun(result.runId);
  if (command !== undefined && run !== undefined && context.persistAcceptedCommand !== undefined) await context.persistAcceptedCommand(validation.envelope, command, run);
  if (context.commandWasKnown) return;
  await persistControlledRunStatus(validation.envelope, context.store);
  const bootstrap = applyBootstrapCommand({
    store: context.store,
    envelope: validation.envelope,
    runId: result.runId,
    payload: context.payload,
    ...(context.options.marketResearchPort === undefined ? {} : { marketResearchPort: context.options.marketResearchPort }),
  });
  const bootstrapEvents = validation.envelope.intent === 'confirm-import'
    ? [...bootstrap.events, ...await applyConfirmedImport(context.store, result.runId, context.payload)]
    : bootstrap.events;
  const sessionId = bootstrapEvents.find((event) => typeof event.data?.['sessionId'] === 'string')?.data?.['sessionId'];
  if (typeof sessionId === 'string') {
    const session = context.store.getBootstrapSession(sessionId);
    const revisionId = bootstrapEvents.find((event) => typeof event.data?.['revisionId'] === 'string')?.data?.['revisionId'];
    const revision = typeof revisionId === 'string' ? context.store.listBootstrapRevisions(sessionId).find((item) => item.id === revisionId) : undefined;
    if (session !== undefined && context.options.persistBootstrapState !== undefined) await context.options.persistBootstrapState(session, revision);
  }
  for (const event of bootstrapEvents) context.eventBus.publish(event);
  const { syncArtifactSummary } = await import('../proposal/proposal');
  syncArtifactSummary(context.store, context.eventBus, validation.envelope, result, context.getWorkspaceValidity);
  const { applyPersistedProposalDecision } = await import('../proposal/proposal');
  await applyPersistedProposalDecision({ store: context.store, eventBus: context.eventBus, envelope: validation.envelope, runId: result.runId, getWorkspaceValidity: context.getWorkspaceValidity, options: context.options });
  await finalizeAuthorProposedArtifact(validation, result, context);
}

async function persistControlledRunStatus(envelope: CommandEnvelope, store: RuntimeStore): Promise<void> {
  if (process.env['DATABASE_URL'] === undefined || process.env['NODE_ENV'] === 'test' || envelope.targetId === undefined) return;
  const transitions: Record<string, readonly [string, string]> = { 'retry-step': ['running', 'run-resumed'], 'resume-run': ['running', 'run-resumed'], 'abort-run': ['aborted', 'run-aborted'], 'mark-external-failure': ['external-failed', 'run-aborted'] };
  const transition = transitions[envelope.intent];
  const run = store.getRun(envelope.targetId);
  if (transition === undefined || run === undefined) return;
  await updatePersistedRunStatus({ runId: run.runId, status: transition[0], nextExpectedState: transition[1] });
}

export async function applyConfirmedImport(store: RuntimeStore, runId: string, payload: Record<string, unknown>): Promise<readonly import('../../event-bus').RunEvent[]> {
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : undefined;
  const sourceRoot = typeof payload['sourceRoot'] === 'string' ? payload['sourceRoot'] : undefined;
  const targetRoot = typeof payload['targetRoot'] === 'string' ? payload['targetRoot'] : undefined;
  if (sessionId === undefined || sourceRoot === undefined || targetRoot === undefined || !('mapping' in payload)) throw new Error('confirm-import requires sessionId, sourceRoot, targetRoot, and mapping.');
  const session = store.getBootstrapSession(sessionId);
  if (session === undefined || session.path !== 'import') throw new Error(`Import Bootstrap session "${sessionId}" was not found.`);
  const result = await confirmImport({ sourceRoot, targetRoot, mapping: payload['mapping'] as ImportMapping });
  const emittedAt = new Date().toISOString(); const revisionId = `bootstrap-revision-${runId}`;
  store.upsertBootstrapRevision({ id: revisionId, sessionId, stage: 'import-health-report', createdAt: emittedAt, summary: 'Import confirmation completed and health report generated.', draft: result.healthReport as unknown as Record<string, unknown> });
  store.setLastKnownSnapshot(session.workspaceId, result.reconcile.snapshot);
  store.setWorkspaceValidity(session.workspaceId, result.reconcile.validity);
  const readySession = result.readyToWrite
    ? transitionBootstrapSession(session, 'ready-to-write')
    : { ...session, status: 'import-review' as const, currentStage: 'import-health-report' as const, currentRevisionId: revisionId, updatedAt: emittedAt };
  store.upsertBootstrapSession({ ...readySession, currentStage: 'import-health-report', currentRevisionId: revisionId, updatedAt: emittedAt });
  const events: import('../../event-bus').RunEvent[] = [
    { type: 'bootstrap.session.updated', runId, emittedAt, data: { sessionId, revisionId } },
    { type: 'bootstrap.stage.changed', runId, emittedAt, data: { sessionId, stage: 'import-health-report' } },
  ];
  if (result.readyToWrite) {
    events.push({ type: 'bootstrap.ready-to-write', runId, emittedAt, data: { sessionId } });
  }
  return events;
}