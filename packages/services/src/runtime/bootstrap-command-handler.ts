/* eslint-disable complexity */

import type { CommandEnvelope } from '../domain';
import type { BootstrapEvidence, BootstrapPath, BootstrapSession, BootstrapStage } from '../bootstrap/types';
import { getNextStageId } from '../bootstrap/stages/stage-defs';
import { abandonBootstrapSession } from '../bootstrap/state-machine/state-machine';
import { extractCleanedSummary } from '../bootstrap/research/research-orchestrator';
import { defaultMarketResearchPort, type MarketResearchPort } from '../bootstrap/research/market-research-port';
import type { ModelProvider } from '../agent/provider';
import { NEW_BOOK_PROPOSAL_STAGES, seedChapterOutlineBatch, seedStageProposal } from './bootstrap-stage-seeding';
import type { RunEvent } from './event-bus';
import { RuntimeStore } from './store';

type BootstrapCommandPayload = Readonly<Record<string, unknown>>;

export interface ApplyBootstrapCommandInput {
  readonly store: RuntimeStore;
  readonly envelope: CommandEnvelope;
  readonly runId: string;
  readonly payload: BootstrapCommandPayload;
  readonly marketResearchPort?: MarketResearchPort;
  readonly provideModel?: () => ModelProvider;
  readonly now?: () => Date;
}

export interface ApplyBootstrapCommandResult {
  readonly events: readonly RunEvent[];
}

function stringValue(payload: BootstrapCommandPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function recordValue(payload: BootstrapCommandPayload, key: string): Record<string, unknown> | undefined {
  const value = payload[key];
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function initialStage(path: BootstrapPath): BootstrapStage {
  return path === 'import' ? 'import-scan' : 'market-research';
}

function event(type: string, runId: string, emittedAt: string, data: Record<string, unknown>): RunEvent {
  return { type, runId, emittedAt, data };
}

function createSession(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const path = stringValue(input.payload, 'path');
  if (path !== 'new-book' && path !== 'import') {
    throw new Error('create-bootstrap-session requires path "new-book" or "import".');
  }
  const sessionId = stringValue(input.payload, 'sessionId') ?? `bootstrap-session-${input.runId}`;
  if (input.store.getBootstrapSession(sessionId) !== undefined) {
    throw new Error(`Bootstrap session "${sessionId}" already exists.`);
  }
  const session: BootstrapSession = {
    id: sessionId,
    workspaceId: input.envelope.workspaceId,
    bookId: input.envelope.bookId,
    path,
    status: path === 'import' ? 'import-review' : 'drafting',
    currentStage: initialStage(path),
    ...(stringValue(input.payload, 'bookName') === undefined ? {} : { bookName: stringValue(input.payload, 'bookName') }),
    ...(stringValue(input.payload, 'sessionType') === undefined ? {} : { sessionType: stringValue(input.payload, 'sessionType') }),
    createdAt: emittedAt,
    updatedAt: emittedAt,
  };
  input.store.upsertBootstrapSession(session);
  return {
    events: [
      event('bootstrap.session.updated', input.runId, emittedAt, { sessionId, status: session.status }),
      event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId, stage: session.currentStage }),
    ],
  };
}

function appendDialogueRevision(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const sessionId = stringValue(input.payload, 'sessionId');
  if (sessionId === undefined) {
    throw new Error('submit-dialogue-round requires sessionId.');
  }
  const session = input.store.getBootstrapSession(sessionId);
  if (session === undefined) {
    throw new Error(`Bootstrap session "${sessionId}" was not found.`);
  }
  const revisionId = `bootstrap-revision-${input.runId}`;
  input.store.upsertBootstrapRevision({
    id: revisionId,
    sessionId,
    stage: session.currentStage,
    createdAt: emittedAt,
    ...(stringValue(input.payload, 'summary') === undefined ? {} : { summary: stringValue(input.payload, 'summary') }),
    ...(recordValue(input.payload, 'draft') === undefined ? {} : { draft: recordValue(input.payload, 'draft') }),
  });
  input.store.upsertBootstrapSession({
    ...session,
    currentRevisionId: revisionId,
    updatedAt: emittedAt,
  });
  return {
    events: [event('bootstrap.session.updated', input.runId, emittedAt, { sessionId, revisionId })],
  };
}

function requireSession(input: ApplyBootstrapCommandInput): BootstrapSession {
  const sessionId = stringValue(input.payload, 'sessionId');
  if (sessionId === undefined) {
    throw new Error(`${input.envelope.intent} requires sessionId.`);
  }
  const session = input.store.getBootstrapSession(sessionId);
  if (session === undefined) {
    throw new Error(`Bootstrap session "${sessionId}" was not found.`);
  }
  return session;
}

function revisionIdFor(runId: string): string {
  return `bootstrap-revision-${runId}`;
}

function importHealthReportReady(store: RuntimeStore, sessionId: string): boolean {
  const report = store.listBootstrapRevisions(sessionId)
    .find((revision) => revision.stage === 'import-health-report')?.draft;
  return report !== undefined && typeof report === 'object' && report['ready'] === true;
}

function saveSessionRevision(
  input: ApplyBootstrapCommandInput,
  session: BootstrapSession,
  emittedAt: string,
  options: {
    readonly stage?: BootstrapStage;
    readonly summary?: string;
    readonly draft?: Record<string, unknown>;
    readonly mapping?: Record<string, unknown>;
    readonly diagnostics?: readonly string[];
    readonly evidenceIds?: readonly string[];
  },
): string {
  const revisionId = revisionIdFor(input.runId);
  input.store.upsertBootstrapRevision({
    id: revisionId,
    sessionId: session.id,
    stage: options.stage ?? session.currentStage,
    createdAt: emittedAt,
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.draft === undefined ? {} : { draft: options.draft }),
    ...(options.mapping === undefined ? {} : { mapping: options.mapping }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
    ...(options.evidenceIds === undefined ? {} : { evidenceIds: options.evidenceIds }),
  });
  return revisionId;
}

async function continueSession(input: ApplyBootstrapCommandInput, emittedAt: string): Promise<ApplyBootstrapCommandResult> {
  const session = requireSession(input);
  if (session.path === 'new-book' && session.currentStage === 'inspiration-dialogue'
    && input.store.listBootstrapRevisions(session.id).filter((revision) => revision.stage === 'inspiration-dialogue').length < 5) {
    throw new Error('Five inspiration dialogue revisions are required before generating the project brief.');
  }

  if (session.path === 'new-book' && session.status === 'advancing' && NEW_BOOK_PROPOSAL_STAGES.has(session.currentStage)) {
    await seedStageProposal(input, session, session.currentStage);
    input.store.upsertBootstrapSession({ ...session, status: 'awaiting-approval', updatedAt: emittedAt });
    return { events: [
      event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, status: 'awaiting-approval' }),
      event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId: session.id, stage: session.currentStage }),
    ] };
  }

  const nextStage = getNextStageId(session.path, session.currentStage);
  if (nextStage === undefined) {
    if (session.path === 'import') {
      if (!importHealthReportReady(input.store, session.id)) {
        throw new Error('Import health report is not ready; fill missing artifacts before continuing to write.');
      }
      const readySession: BootstrapSession = { ...session, status: 'ready-to-write', updatedAt: emittedAt };
      input.store.upsertBootstrapSession(readySession);
      return { events: [
        event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, status: readySession.status }),
        event('bootstrap.ready-to-write', input.runId, emittedAt, { sessionId: session.id }),
      ] };
    }
    if (session.path === 'new-book' && session.currentStage === 'chapter-outline-batch') {
      await seedChapterOutlineBatch(input, session);
      input.store.upsertBootstrapSession({ ...session, status: 'awaiting-approval', updatedAt: emittedAt });
      return { events: [
        event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, status: 'awaiting-approval' }),
        event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId: session.id, stage: 'chapter-outline-batch' }),
      ] };
    }
    throw new Error(`Bootstrap stage "${session.currentStage}" cannot be continued.`);
  }
  const revisionId = saveSessionRevision(input, session, emittedAt, {
    summary: `Author explicitly continued from ${session.currentStage} to ${nextStage}.`,
    stage: nextStage,
  });
  const seeded = await seedStageProposal(input, session, nextStage);
  input.store.upsertBootstrapSession({
    ...session,
    status: session.path === 'import'
      ? 'import-review'
      : seeded ? 'awaiting-approval' : 'advancing',
    currentStage: nextStage,
    currentRevisionId: revisionId,
    updatedAt: emittedAt,
  });
  return { events: [
    event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, revisionId }),
    event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId: session.id, stage: nextStage }),
  ] };
}

function researchSourcesValue(payload: BootstrapCommandPayload): readonly { readonly url: string; readonly title: string; readonly summary: string }[] {
  const sources = payload['sources'];
  if (!Array.isArray(sources)) {
    return [];
  }
  return sources.flatMap((item) => {
    if (item === null || typeof item !== 'object') {
      return [];
    }
    const source = item as Record<string, unknown>;
    return typeof source['url'] === 'string' && typeof source['title'] === 'string' && typeof source['summary'] === 'string'
      ? [{ url: source['url'], title: source['title'], summary: source['summary'] }]
      : [];
  });
}

/**
 * Persists research sources as `BootstrapEvidence` through the restricted
 * `MarketResearchPort`, applying the source/copyright policy before any source can
 * be referenced from canonical content
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3).
 */
function persistResearchEvidence(
  input: ApplyBootstrapCommandInput,
  session: BootstrapSession,
  emittedAt: string,
): readonly string[] {
  const port = input.marketResearchPort ?? defaultMarketResearchPort;
  const sources = researchSourcesValue(input.payload);
  return sources.map((source, index) => {
    const policy = port.evaluatePolicy(source);
    const evidence: BootstrapEvidence = {
      id: `evidence-${input.runId}-${index}`,
      sessionId: session.id,
      url: source.url,
      title: source.title,
      collectedAt: emittedAt,
      cleanedSummary: extractCleanedSummary(source.summary),
      license: policy.license,
      copyrightBoundary: policy.copyrightBoundary,
      status: 'draft',
    };
    input.store.upsertBootstrapEvidence(evidence);
    return evidence.id;
  });
}

function submitResearch(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const session = requireSession(input);
  if (session.path !== 'new-book' || session.currentStage !== 'market-research') {
    throw new Error('Market research is only available during the new-book market-research stage.');
  }
  const draft = recordValue(input.payload, 'draft');
  const evidenceIds = persistResearchEvidence(input, session, emittedAt);
  const revisionId = saveSessionRevision(input, session, emittedAt, {
    summary: stringValue(input.payload, 'summary') ?? 'Market research trend brief recorded.',
    ...(draft === undefined ? {} : { draft }),
    ...(evidenceIds.length === 0 ? {} : { evidenceIds }),
  });
  input.store.upsertBootstrapSession({ ...session, currentRevisionId: revisionId, updatedAt: emittedAt });
  return { events: [event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, revisionId })] };
}

function scanImport(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const session = requireSession(input);
  if (session.path !== 'import' || session.currentStage !== 'import-scan') {
    throw new Error('Import scans are only available during the import-scan stage.');
  }
  const mapping = recordValue(input.payload, 'mapping');
  const diagnostics = Array.isArray(input.payload['diagnostics'])
    ? input.payload['diagnostics'].filter((item): item is string => typeof item === 'string')
    : undefined;
  const revisionId = saveSessionRevision(input, session, emittedAt, {
    summary: stringValue(input.payload, 'summary') ?? 'Import scan completed; mapping awaits author confirmation.',
    ...(mapping === undefined ? {} : { mapping }),
    ...(diagnostics === undefined ? {} : { diagnostics }),
  });
  input.store.upsertBootstrapSession({
    ...session,
    status: 'import-review',
    currentStage: 'import-mapping',
    currentRevisionId: revisionId,
    updatedAt: emittedAt,
  });
  return { events: [
    event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, revisionId }),
    event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId: session.id, stage: 'import-mapping' }),
  ] };
}

function discardSession(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const session = requireSession(input);
  const abandoned = abandonBootstrapSession(session);
  input.store.upsertBootstrapSession({ ...abandoned, updatedAt: emittedAt });
  return { events: [event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, status: 'abandoned' })] };
}

export async function applyBootstrapCommand(input: ApplyBootstrapCommandInput): Promise<ApplyBootstrapCommandResult> {
  const emittedAt = (input.now?.() ?? new Date()).toISOString();
  if (input.envelope.intent === 'create-bootstrap-session') {
    return createSession(input, emittedAt);
  }
  if (input.envelope.intent === 'submit-dialogue-round') {
    return appendDialogueRevision(input, emittedAt);
  }
  if (input.envelope.intent === 'continue-bootstrap-session') {
    return await continueSession(input, emittedAt);
  }
  if (input.envelope.intent === 'submit-market-research') {
    return submitResearch(input, emittedAt);
  }
  if (input.envelope.intent === 'scan-import-directory') {
    return scanImport(input, emittedAt);
  }
  if (input.envelope.intent === 'discard-bootstrap-session') {
    return discardSession(input, emittedAt);
  }
  return { events: [] };
}