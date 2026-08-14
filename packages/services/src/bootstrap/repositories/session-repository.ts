import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '../types';

export interface BootstrapSessionStore {
  readonly sessions: Map<string, BootstrapSession>;
  readonly revisions: Map<string, BootstrapRevision>;
  readonly evidence: Map<string, BootstrapEvidence>;
}

export function createBootstrapSessionStore(): BootstrapSessionStore {
  return {
    sessions: new Map(),
    revisions: new Map(),
    evidence: new Map(),
  };
}

export function listBootstrapSessions(store: BootstrapSessionStore): readonly BootstrapSession[] {
  return Array.from(store.sessions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getBootstrapSession(store: BootstrapSessionStore, sessionId: string): BootstrapSession | undefined {
  return store.sessions.get(sessionId);
}

export function createBootstrapSession(store: BootstrapSessionStore, session: BootstrapSession): BootstrapSession {
  store.sessions.set(session.id, session);
  return session;
}

export function appendBootstrapRevision(store: BootstrapSessionStore, revision: BootstrapRevision): BootstrapRevision {
  store.revisions.set(revision.id, revision);
  return revision;
}

export function listBootstrapRevisions(store: BootstrapSessionStore, sessionId: string): readonly BootstrapRevision[] {
  return Array.from(store.revisions.values()).filter((revision) => revision.sessionId === sessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listBootstrapEvidence(store: BootstrapSessionStore, sessionId: string): readonly BootstrapEvidence[] {
  return Array.from(store.evidence.values()).filter((item) => item.sessionId === sessionId)
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}
