import { describe, expect, test } from 'bun:test';

import { createWorkspaceStreamConnector, parseWorkspaceFrame, workspaceWsUrl } from './workspace-stream';

import type { MessageLike, WorkspaceSocket } from './workspace-stream';

function createFakeSocket(): WorkspaceSocket & {
  readonly listeners: ((event: MessageLike) => void)[];
  readonly closeCount: () => number;
  readonly trigger: (data: unknown) => void;
} {
  const listeners: ((event: MessageLike) => void)[] = [];
  let closed = 0;
  const socket: WorkspaceSocket = {
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: (_type, listener) => {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },
    close: () => {
      closed += 1;
    },
  };
  return {
    ...socket,
    listeners,
    closeCount: () => closed,
    trigger: (data) => {
      for (const listener of [...listeners]) {
        listener({ data });
      }
    },
  };
}

describe('workspace event stream helpers', () => {
  test('parseWorkspaceFrame parses a valid frame', () => {
    const frame = parseWorkspaceFrame(JSON.stringify({
      type: 'artifact.approved',
      runId: 'run-001',
      emittedAt: '2026-08-18T00:00:00.000Z',
      data: { targetId: 'chapter-0001-outline' },
    }));

    expect(frame).toEqual({
      type: 'artifact.approved',
      runId: 'run-001',
      emittedAt: '2026-08-18T00:00:00.000Z',
      data: { targetId: 'chapter-0001-outline' },
    });
  });

  test('parseWorkspaceFrame rejects malformed or incomplete frames', () => {
    expect(parseWorkspaceFrame('not-json')).toBeUndefined();
    expect(parseWorkspaceFrame(JSON.stringify({ runId: 'run-001' }))).toBeUndefined();
  });

  test('workspaceWsUrl uses wss for https and ws otherwise', () => {
    expect(workspaceWsUrl('http://localhost:3001/app')).toBe('ws://localhost:3001/api/ws');
    expect(workspaceWsUrl('https://novel.example/app')).toBe('wss://novel.example/api/ws');
  });
});

describe('createWorkspaceStreamConnector', () => {
  test('forwards parsed frames to onEvent and closes on stop', () => {
    const socket = createFakeSocket();
    const frames: string[] = [];
    const connector = createWorkspaceStreamConnector({
      baseUrl: 'http://localhost:3001',
      createSocket: () => socket,
      onEvent: (frame) => frames.push(frame.type),
    });

    connector.start();
    socket.trigger(JSON.stringify({ type: 'run.started', runId: 'run-001', emittedAt: '2026-08-18T00:00:00.000Z' }));
    socket.trigger(JSON.stringify({ type: 'artifact.proposed', runId: 'run-002', emittedAt: '2026-08-18T00:00:00.000Z' }));

    expect(frames).toEqual(['run.started', 'artifact.proposed']);

    connector.stop();
    socket.trigger(JSON.stringify({ type: 'run.completed', runId: 'run-001', emittedAt: '2026-08-18T00:00:00.000Z' }));

    expect(frames).toEqual(['run.started', 'artifact.proposed']);
    expect(socket.closeCount()).toBe(1);
  });

  test('ignores malformed frames', () => {
    const socket = createFakeSocket();
    const frames: string[] = [];
    const connector = createWorkspaceStreamConnector({
      baseUrl: 'http://localhost:3001',
      createSocket: () => socket,
      onEvent: (frame) => frames.push(frame.type),
    });

    connector.start();
    socket.trigger('garbage');
    socket.trigger(JSON.stringify({ runId: 'run-001' }));

    expect(frames).toEqual([]);
    connector.stop();
  });
});
