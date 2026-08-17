/* eslint-disable complexity */
export interface WorkspaceEventFrame {
  readonly type: string;
  readonly runId: string;
  readonly emittedAt: string;
  readonly data?: Record<string, unknown>;
}

export interface MessageLike {
  readonly data: unknown;
}

export interface WorkspaceSocket {
  readonly addEventListener: (type: 'message', listener: (event: MessageLike) => void) => void;
  readonly removeEventListener: (type: 'message', listener: (event: MessageLike) => void) => void;
  readonly close: () => void;
}

export type WorkspaceSocketFactory = (url: string) => WorkspaceSocket;

export function parseWorkspaceFrame(raw: string): WorkspaceEventFrame | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceEventFrame>;
    if (typeof parsed.type !== 'string' || typeof parsed.runId !== 'string') {
      return undefined;
    }
    return {
      type: parsed.type,
      runId: parsed.runId,
      emittedAt: parsed.emittedAt ?? '',
      ...(parsed.data === undefined ? {} : { data: parsed.data }),
    };
  } catch {
    return undefined;
  }
}

export function workspaceWsUrl(base: string): string {
  const url = new URL(base);
  const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${url.host}/api/ws`;
}

export interface WorkspaceStreamConnector {
  readonly start: () => void;
  readonly stop: () => void;
}

/** Bridges a single WebSocket connection's frames onto an event callback. */
export function createWorkspaceStreamConnector(options: {
  readonly baseUrl: string;
  readonly createSocket: WorkspaceSocketFactory;
  readonly onEvent: (frame: WorkspaceEventFrame) => void;
}): WorkspaceStreamConnector {
  const { baseUrl, createSocket, onEvent } = options;
  let socket: WorkspaceSocket | undefined;
  let listener: ((event: MessageLike) => void) | undefined;

  const start = (): void => {
    socket = createSocket(workspaceWsUrl(baseUrl));
    listener = (event) => {
      const frame = parseWorkspaceFrame(String(event.data));
      if (frame !== undefined) {
        onEvent(frame);
      }
    };
    socket.addEventListener('message', listener);
  };

  const stop = (): void => {
    if (socket === undefined) {
      return;
    }
    if (listener !== undefined) {
      socket.removeEventListener('message', listener);
    }
    socket.close();
    socket = undefined;
  };

  return { start, stop };
}
