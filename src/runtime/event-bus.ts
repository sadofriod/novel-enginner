export interface RunEvent {
  readonly id?: number;
  readonly type: string;
  readonly runId: string;
  readonly emittedAt: string;
  readonly data?: Record<string, unknown>;
}

type Listener = (event: RunEvent) => void;

/**
 * Minimal in-process pub/sub used to fan out run events to SSE subscribers, per
 * docs/architecture/modules/07-api-events-and-runtime.md §7.5/§7.6. One workspace maps
 * to one Bun service instance (§7.8), so a single process-wide bus is sufficient for v1.
 */
export class RunEventBus {
  private readonly listenersByRun = new Map<string, Set<Listener>>();
  private readonly historyByRun = new Map<string, RunEvent[]>();
  private readonly nextEventIdByRun = new Map<string, number>();
  private readonly maxHistorySize: number;

  constructor(maxHistorySize = 100) {
    this.maxHistorySize = Math.max(1, Math.floor(maxHistorySize));
  }

  publish(event: RunEvent): void {
    const nextEventId = (this.nextEventIdByRun.get(event.runId) ?? 0) + 1;
    this.nextEventIdByRun.set(event.runId, nextEventId);
    const eventWithId = { ...event, id: event.id ?? nextEventId };
    const history = [...(this.historyByRun.get(event.runId) ?? []), eventWithId];
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
    this.historyByRun.set(event.runId, history);

    const listeners = this.listenersByRun.get(event.runId);
    if (listeners === undefined) {
      return;
    }
    for (const listener of listeners) {
      listener(eventWithId);
    }
  }

  subscribe(runId: string, listener: Listener): () => void {
    const listeners = this.listenersByRun.get(runId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listenersByRun.set(runId, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  history(runId: string): readonly RunEvent[] {
    const stored = this.historyByRun.get(runId);
    return stored === undefined ? [] : [...stored];
  }

  historyAfter(runId: string, lastEventId: number | undefined): readonly RunEvent[] {
    const history = this.history(runId);
    if (lastEventId === undefined) {
      return history;
    }
    return history.filter((event) => (event.id ?? 0) > lastEventId);
  }
}
