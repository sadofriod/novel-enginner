/* eslint-disable complexity */

import { useCallback, useState } from 'react';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';
import {
  useSubmitCommandMutation,
  useGetBootstrapConfigQuery,
  useGetCommandQuery,
  useGetRunQuery,
  useListArtifactsQuery,
  useListRunsQuery,
} from '../control-api';
import { ControlConsole } from '../ControlConsole';
import type { ApprovalAction } from '../components/ArtifactDetail';
import { RtkCommandOperationsPanel } from '../components/RtkCommandOperationsPanel';
import { useRunEventStream } from './use-run-event-stream';

export function ControlConsoleContainer() {
  const { data: artifacts = [], refetch: refetchArtifacts } = useListArtifactsQuery(undefined, { pollingInterval: 5000 });
  const { data: runs = [], refetch: refetchRuns } = useListRunsQuery(undefined, { pollingInterval: 5000 });
  const { data: config } = useGetBootstrapConfigQuery(undefined, { pollingInterval: 30000 });
  const [submitCommand] = useSubmitCommandMutation();

  const [selected, setSelected] = useState<ArtifactSummary | undefined>();
  const [lastAccepted, setLastAccepted] = useState<CommandResult | undefined>();
  const acceptedLast = lastAccepted !== undefined && lastAccepted.status === 'accepted' ? lastAccepted : undefined;
  const { data: lastCommand } = useGetCommandQuery(acceptedLast?.commandId ?? '', { skip: acceptedLast === undefined });
  const { data: lastRun } = useGetRunQuery(acceptedLast?.runId ?? '', { skip: acceptedLast === undefined });

  const selectedArtifact = selected ?? artifacts[0];
  const relatedRun = selectedArtifact === undefined
    ? undefined
    : runs.find((run) => run.artifactType === selectedArtifact.artifactType && run.targetId === selectedArtifact.targetId);

  const refresh = useCallback(() => {
    void refetchArtifacts();
    void refetchRuns();
  }, [refetchArtifacts, refetchRuns]);
  useRunEventStream(relatedRun?.runId, refresh);

  const handleAction = (artifact: ArtifactSummary, action: ApprovalAction): void => {
    if (action === 'delete' || config === undefined) {
      return;
    }
    void submitCommand({
      workspaceId: config.workspaceId,
      bookId: config.bookId,
      artifactType: artifact.artifactType,
      targetId: artifact.targetId,
      intent: action,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `web-${action}-${artifact.targetId}-${Date.now().toString(36)}`,
    });
  };

  const handleSelect = (artifact: ArtifactSummary): void => {
    setSelected(artifact);
  };

  const handleCommandCompleted = useCallback(async (result: CommandResult): Promise<void> => {
    if (result.status === 'accepted') {
      setLastAccepted(result);
    }
    refresh();
  }, [refresh]);

  return (
    <ControlConsole
      artifacts={artifacts}
      runs={runs}
      {...(selectedArtifact === undefined ? {} : { selectedArtifact })}
      onSelectArtifact={handleSelect}
      onAction={handleAction}
      {...(acceptedLast === undefined ? {} : { lastCommand: acceptedLast })}
      {...(lastCommand === undefined ? {} : { lastCommandRecord: lastCommand })}
      {...(lastRun === undefined ? {} : { lastCommandRun: lastRun })}
      commandPanel={
        <RtkCommandOperationsPanel
          workspaceId={config?.workspaceId}
          bookId={config?.bookId}
          onCommandCompleted={handleCommandCompleted}
        />
      }
    />
  );
}
