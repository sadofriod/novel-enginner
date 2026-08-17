import type { RunEvent } from './event-bus';
import type { RunEventBus } from './event-bus';

export function serializeWorkspaceEvent(event: RunEvent): string {
  return JSON.stringify({
    type: event.type,
    runId: event.runId,
    emittedAt: event.emittedAt,
    ...(event.data === undefined ? {} : { data: event.data }),
  });
}

export interface WorkspaceEventRelay {
  readonly close: () => void;
}

/** Bridges every workspace event onto a single WebSocket send callback. */
export function createWorkspaceEventRelay(options: {
  readonly eventBus: RunEventBus;
  readonly send: (frame: string) => void;
}): WorkspaceEventRelay {
  const unsubscribe = options.eventBus.subscribeAll((event) => {
    options.send(serializeWorkspaceEvent(event));
  });
  return { close: unsubscribe };
}
