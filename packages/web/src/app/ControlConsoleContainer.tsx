/* eslint-disable complexity */

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import { useSubmitCommandMutation, useGetBootstrapConfigQuery, useListArtifactsQuery, useListRunsQuery } from '../control-api';
import { ControlConsole } from '../ControlConsole';
import type { ApprovalAction } from '../components/ArtifactDetail';
import { RtkCommandOperationsPanel } from '../components/RtkCommandOperationsPanel';

export function ControlConsoleContainer() {
  const { data: artifacts = [] } = useListArtifactsQuery(undefined, { pollingInterval: 5000 });
  const { data: runs = [] } = useListRunsQuery(undefined, { pollingInterval: 5000 });
  const { data: config } = useGetBootstrapConfigQuery(undefined, { pollingInterval: 30000 });
  const [submitCommand] = useSubmitCommandMutation();

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

  return (
    <ControlConsole
      artifacts={artifacts}
      runs={runs}
      {...(config === undefined ? {} : { workspaceId: config.workspaceId, bookId: config.bookId })}
      onAction={handleAction}
      commandPanel={
        <RtkCommandOperationsPanel
          workspaceId={config?.workspaceId}
          bookId={config?.bookId}
          onCommandCompleted={async () => undefined}
        />
      }
    />
  );
}
