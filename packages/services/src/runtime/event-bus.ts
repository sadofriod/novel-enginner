import { createChildLogger } from '../common/logger';

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
  private readonly logger = createChildLogger('event-bus');
  private readonly listenersByRun = new Map<string, Set<Listener>>();
  private readonly historyByRun = new Map<string, RunEvent[]>();
  private readonly nextEventIdByRun = new Map<string, number>();
  private readonly maxHistorySize: number;

  constructor(maxHistorySize = 100) {
    this.maxHistorySize = Math.max(1, Math.floor(maxHistorySize));
    this.logger.debug({ maxHistorySize: this.maxHistorySize }, 'Event bus initialized');
  }

  publish(event: RunEvent): void {
    const nextEventId = (this.nextEventIdByRun.get(event.runId) ?? 0) + 1;
    this.nextEventIdByRun.set(event.runId, nextEventId);
    const eventWithId = { ...event, id: event.id ?? nextEventId };
    this.recordHistory(event.runId, eventWithId);

    this.logger.debug({ 
      runId: event.runId, 
      eventId: eventWithId.id, 
      eventType: event.type,
      dataKeys: event.data ? Object.keys(event.data) : undefined,
    }, 'Event published');

    this.broadcastToListeners(event.runId, eventWithId);
  }

  private broadcastToListeners(runId: string, event: RunEvent): void {
    const listeners = this.listenersByRun.get(runId);
    if (listeners === undefined) {
      this.logger.trace({ runId }, 'No listeners for this run');
      return;
    }
    
    const listenerCount = listeners.size;
    this.logger.debug({ runId, listenerCount }, 'Broadcasting event to listeners');
    
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error({ 
          runId, 
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        }, 'Error invoking event listener');
      }
    }
  }

  private recordHistory(runId: string, event: RunEvent): void {
    const history = [...(this.historyByRun.get(runId) ?? []), event];
    if (history.length > this.maxHistorySize) {
      const removed = history.length - this.maxHistorySize;
      history.splice(0, removed);
      this.logger.trace({ runId, removed }, 'History limit reached, old events removed');
    }
    this.historyByRun.set(runId, history);
  }

  subscribe(runId: string, listener: Listener): () => void {
    const listeners = this.listenersByRun.get(runId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listenersByRun.set(runId, listeners);
    
    this.logger.debug({ runId, totalListeners: listeners.size }, 'New listener subscribed');
    
    return () => {
      listeners.delete(listener);
      this.logger.debug({ runId, totalListeners: listeners.size }, 'Listener unsubscribed');
    };
  }

  history(runId: string): readonly RunEvent[] {
    const stored = this.historyByRun.get(runId);
    const eventCount = stored?.length ?? 0;
    this.logger.trace({ runId, eventCount }, 'History retrieved');
    return stored === undefined ? [] : [...stored];
  }

  historyAfter(runId: string, lastEventId: number | undefined): readonly RunEvent[] {
    const history = this.history(runId);
    if (lastEventId === undefined) {
      this.logger.trace({ runId, eventCount: history.length }, 'Full history returned');
      return history;
    }
    const filtered = history.filter((event) => (event.id ?? 0) > lastEventId);
    this.logger.trace({ runId, lastEventId, originalCount: history.length, filteredCount: filtered.length }, 'History filtered by event ID');
    return filtered;
  }
}
