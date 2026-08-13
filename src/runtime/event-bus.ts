export interface RunEvent {
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

  publish(event: RunEvent): void {
    const history = this.historyByRun.get(event.runId) ?? [];
    history.push(event);
    this.historyByRun.set(event.runId, history);

    const listeners = this.listenersByRun.get(event.runId);
    if (listeners === undefined) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
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
    return this.historyByRun.get(runId) ?? [];
  }
}
