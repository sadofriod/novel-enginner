import type { CommandEnvelope, CommandIntent } from '../../domain';
import { createChildLogger } from '../../common/logger';

import type { RunEventBus } from '../event-bus';
import type { RuntimeStore } from '../store';

export function applyRunControlIntent(
  envelope: CommandEnvelope,
  store: RuntimeStore,
  eventBus: RunEventBus,
  emittedAt: string,
): void {
  const logger = createChildLogger('command-handler:run-control');

  const controlledRunIntents: Readonly<Record<string, { readonly status: string; readonly nextState: string }>> = {
    'retry-step': { status: 'running', nextState: 'run-resumed' },
    'resume-run': { status: 'running', nextState: 'run-resumed' },
    'abort-run': { status: 'aborted', nextState: 'run-aborted' },
    'mark-external-failure': { status: 'external-failed', nextState: 'run-aborted' },
  };
  const transition = controlledRunIntents[envelope.intent];
  if (transition === undefined || envelope.targetId === undefined) {
    return;
  }

  logger.debug({ intent: envelope.intent, targetRunId: envelope.targetId, newStatus: transition.status }, 'Applying run control intent');

  const controlledRun = store.updateRunStatus(envelope.targetId, transition.status, transition.nextState);
  if (controlledRun === undefined) {
    logger.error({ targetRunId: envelope.targetId }, 'Target run for control intent not found');
    eventBus.publish({
      type: 'run.step.failed',
      runId: envelope.targetId,
      emittedAt,
      data: { reason: `controlled run ${envelope.targetId} was not found` },
    });
    return;
  }

  logger.info({ runId: controlledRun.runId, intent: envelope.intent, newStatus: transition.status }, 'Run control intent applied');
  publishRunControlEvent(eventBus, controlledRun.runId, envelope.intent, transition.status, emittedAt);
}

export function publishRunControlEvent(
  eventBus: RunEventBus,
  runId: string,
  intent: CommandIntent,
  status: string,
  emittedAt: string,
): void {
  const logger = createChildLogger('command-handler:run-event');

  const eventType = status === 'aborted'
    ? 'run.aborted'
    : status === 'external-failed'
      ? 'external.failure'
      : undefined;
  if (eventType === undefined) {
    logger.trace({ status }, 'No event type for run status, skipping event publication');
    return;
  }

  logger.debug({ runId, eventType, intent }, 'Publishing run control event');
  eventBus.publish({
    type: eventType,
    runId,
    emittedAt,
    data: { reason: `run control intent: ${intent}` },
  });
}
