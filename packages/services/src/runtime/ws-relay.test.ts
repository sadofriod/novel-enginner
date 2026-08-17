import { describe, expect, test } from 'bun:test';

import { RunEventBus } from './event-bus';
import { createWorkspaceEventRelay, serializeWorkspaceEvent } from './ws-relay';

describe('workspace event relay', () => {
  test('serializes events into JSON frames with type/runId/emittedAt/data', () => {
    const frame = JSON.parse(serializeWorkspaceEvent({
      type: 'artifact.approved',
      runId: 'run-001',
      emittedAt: '2026-08-18T00:00:00.000Z',
      data: { targetId: 'chapter-0001-outline' },
    })) as Record<string, unknown>;

    expect(frame).toEqual({
      type: 'artifact.approved',
      runId: 'run-001',
      emittedAt: '2026-08-18T00:00:00.000Z',
      data: { targetId: 'chapter-0001-outline' },
    });
  });

  test('omits data when absent', () => {
    const frame = JSON.parse(serializeWorkspaceEvent({
      type: 'run.started',
      runId: 'run-001',
      emittedAt: '2026-08-18T00:00:00.000Z',
    })) as Record<string, unknown>;

    expect(frame).not.toHaveProperty('data');
  });

  test('forwards every published event to send', () => {
    const bus = new RunEventBus();
    const frames: string[] = [];
    const relay = createWorkspaceEventRelay({ eventBus: bus, send: (frame) => frames.push(frame) });

    bus.publish({ type: 'run.started', runId: 'run-001', emittedAt: '2026-08-18T00:00:00.000Z' });
    bus.publish({ type: 'artifact.proposed', runId: 'run-002', emittedAt: '2026-08-18T00:00:01.000Z' });

    expect(frames).toHaveLength(2);
    expect(JSON.parse(frames[0] as string)).toMatchObject({ type: 'run.started', runId: 'run-001' });
    relay.close();
  });

  test('stops forwarding after close', () => {
    const bus = new RunEventBus();
    const frames: string[] = [];
    const relay = createWorkspaceEventRelay({ eventBus: bus, send: (frame) => frames.push(frame) });

    relay.close();
    bus.publish({ type: 'run.started', runId: 'run-001', emittedAt: '2026-08-18T00:00:00.000Z' });

    expect(frames).toHaveLength(0);
  });
});
