import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';
import { RunEventBus } from './event-bus';

const BASE_ENVELOPE = {
  workspaceId: 'workspace-cybernovel-001',
  bookId: 'book-quantum-ascension',
  artifactType: 'chapter-outline',
  targetId: 'chapter-0042-outline',
  intent: 'propose',
  requestedBy: 'author-local',
  approvalMode: 'manual',
  idempotencyKey: 'cmd-20260812-001',
};

function postJson(fetch: (request: Request) => Promise<Response>, path: string, body: unknown): Promise<Response> {
  return fetch(
    new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('SSE run stream', () => {
  test('GET /runs/:runId/stream replays history and streams new events', async () => {
    const { fetch, eventBus } = createApiServer();
    const accepted = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-sse-001' });
    const { runId } = await accepted.json();

    const response = await fetch(new Request(`http://local.test/runs/${runId}/stream`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    while (!buffered.includes('event: run.started')) {
      const { value } = await reader.read();
      buffered += decoder.decode(value ?? new Uint8Array());
    }
    expect(buffered).toContain('event: command.accepted');
    expect(buffered).toContain('event: run.started');

    eventBus.publish({ type: 'run.completed', runId, emittedAt: new Date().toISOString() });
    let nextBuffered = '';
    while (!nextBuffered.includes('event: run.completed')) {
      const { value } = await reader.read();
      nextBuffered += decoder.decode(value ?? new Uint8Array());
    }
    expect(nextBuffered).toContain('event: run.completed');
    await reader.cancel();
  });

  test('replays only events after Last-Event-ID and bounds event history', async () => {
    const { fetch, eventBus } = createApiServer({ eventBus: new RunEventBus(2) });
    eventBus.publish({ type: 'run.step.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:00.000Z', data: { step: 1 } });
    eventBus.publish({ type: 'run.step.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:01.000Z', data: { step: 2 } });
    eventBus.publish({ type: 'run.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:02.000Z' });

    expect(eventBus.history('run-replay-001')).toHaveLength(2);
    const response = await fetch(new Request('http://local.test/runs/run-replay-001/stream', {
      headers: { 'last-event-id': '2' },
    }));
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    await reader.cancel();
    expect(text).toContain('event: run.completed');
    expect(text).not.toContain('"step":2');
    expect(text).toContain('id: 3');
  });
});
