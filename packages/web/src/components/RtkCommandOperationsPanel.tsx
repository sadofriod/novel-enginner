import { useSubmitCommandMutation, useSubmitSyncMutation } from '../control-api';
import type { ApiClient, CommandInput, SyncCommandInput } from '../api-client';
import { CommandOperationsPanel } from './CommandOperationsPanel';

type CommandApi = Pick<ApiClient, 'submitCommand' | 'submitSync'>;

type RtkCommandOperationsPanelProps = {
  readonly workspaceId: string | undefined;
  readonly bookId: string | undefined;
  readonly onCommandCompleted: (result: Awaited<ReturnType<ApiClient['submitCommand']>>) => Promise<void>;
};

export function RtkCommandOperationsPanel({
  workspaceId,
  bookId,
  onCommandCompleted,
}: RtkCommandOperationsPanelProps) {
  const [submitCommand] = useSubmitCommandMutation();
  const [submitSync] = useSubmitSyncMutation();
  const commandApi: CommandApi = {
    submitCommand: (input: CommandInput) => submitCommand(input).unwrap(),
    submitSync: (intent: 're-sync-state' | 'rebuild-graph', input: SyncCommandInput) => submitSync({ intent, input }).unwrap(),
  };

  return (
    <CommandOperationsPanel
      apiClient={commandApi}
      workspaceId={workspaceId}
      bookId={bookId}
      onCommandCompleted={onCommandCompleted}
    />
  );
}
