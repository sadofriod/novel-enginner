import { describe, expect, test } from 'bun:test';

import { RunEventBus } from './event-bus';

import type { RunEvent } from './event-bus';

function makeEvent(type: string, runId = 'run-001'): RunEvent {
  return { type, runId, emittedAt: '2026-08-18T00:00:00.000Z', data: { seq: 1 } };
}

describe('RunEventBus global subscription', () => {
  test('subscribeAll receives events for every run', () => {
    const bus = new RunEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribeAll((event) => received.push(event.type));

    bus.publish(makeEvent('run.started', 'run-001'));
    bus.publish(makeEvent('artifact.approved', 'run-002'));

    expect(received).toEqual(['run.started', 'artifact.approved']);
    unsubscribe();
  });

  test('unsubscribing stops global delivery', () => {
    const bus = new RunEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribeAll((event) => received.push(event.type));

    bus.publish(makeEvent('run.started'));
    unsubscribe();
    bus.publish(makeEvent('run.completed'));

    expect(received).toEqual(['run.started']);
  });

  test('per-run subscriptions still work alongside global ones', () => {
    const bus = new RunEventBus();
    const perRun: string[] = [];
    const global: string[] = [];
    bus.subscribe('run-001', (event) => perRun.push(event.type));
    bus.subscribeAll((event) => global.push(event.type));

    bus.publish(makeEvent('run.started', 'run-001'));
    bus.publish(makeEvent('run.completed', 'run-002'));

    expect(perRun).toEqual(['run.started']);
    expect(global).toEqual(['run.started', 'run.completed']);
  });
});
