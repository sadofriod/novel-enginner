/* eslint-disable complexity */

import type { CommandEnvelope } from '../domain';
import type { BootstrapPath, BootstrapSession, BootstrapStage } from '../bootstrap/types';
import { getNextStageId, isLastStage } from '../bootstrap/stages/stage-defs';
import { abandonBootstrapSession } from '../bootstrap/state-machine/state-machine';
import type { RunEvent } from './event-bus';
import { RuntimeStore } from './store';

type BootstrapCommandPayload = Readonly<Record<string, unknown>>;

export interface ApplyBootstrapCommandInput {
  readonly store: RuntimeStore;
  readonly envelope: CommandEnvelope;
  readonly runId: string;
  readonly payload: BootstrapCommandPayload;
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
  });
  return revisionId;
}

function continueSession(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const session = requireSession(input);
  if (session.path === 'new-book' && session.currentStage === 'inspiration-dialogue'
    && input.store.listBootstrapRevisions(session.id).filter((revision) => revision.stage === 'inspiration-dialogue').length < 5) {
    throw new Error('Five inspiration dialogue revisions are required before generating the project brief.');
  }
  const nextStage = getNextStageId(session.path, session.currentStage);
  if (nextStage === undefined) {
    if (!isLastStage(session.path, session.currentStage)) {
      throw new Error(`Bootstrap stage "${session.currentStage}" cannot be continued.`);
    }
    const readySession: BootstrapSession = {
      ...session,
      status: 'ready-to-write',
      updatedAt: emittedAt,
    };
    input.store.upsertBootstrapSession(readySession);
    return { events: [
      event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, status: readySession.status }),
      event('bootstrap.ready-to-write', input.runId, emittedAt, { sessionId: session.id }),
    ] };
  }
  const revisionId = saveSessionRevision(input, session, emittedAt, {
    summary: `Author explicitly continued from ${session.currentStage} to ${nextStage}.`,
    stage: nextStage,
  });
  input.store.upsertBootstrapSession({
    ...session,
    status: session.path === 'import' ? 'import-review' : 'advancing',
    currentStage: nextStage,
    currentRevisionId: revisionId,
    updatedAt: emittedAt,
  });
  return { events: [
    event('bootstrap.session.updated', input.runId, emittedAt, { sessionId: session.id, revisionId }),
    event('bootstrap.stage.changed', input.runId, emittedAt, { sessionId: session.id, stage: nextStage }),
  ] };
}

function submitResearch(input: ApplyBootstrapCommandInput, emittedAt: string): ApplyBootstrapCommandResult {
  const session = requireSession(input);
  if (session.path !== 'new-book' || session.currentStage !== 'market-research') {
    throw new Error('Market research is only available during the new-book market-research stage.');
  }
  const draft = recordValue(input.payload, 'draft');
  const revisionId = saveSessionRevision(input, session, emittedAt, {
    summary: stringValue(input.payload, 'summary') ?? 'Market research trend brief recorded.',
    ...(draft === undefined ? {} : { draft }),
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

export function applyBootstrapCommand(input: ApplyBootstrapCommandInput): ApplyBootstrapCommandResult {
  const emittedAt = (input.now?.() ?? new Date()).toISOString();
  if (input.envelope.intent === 'create-bootstrap-session') {
    return createSession(input, emittedAt);
  }
  if (input.envelope.intent === 'submit-dialogue-round') {
    return appendDialogueRevision(input, emittedAt);
  }
  if (input.envelope.intent === 'continue-bootstrap-session') {
    return continueSession(input, emittedAt);
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