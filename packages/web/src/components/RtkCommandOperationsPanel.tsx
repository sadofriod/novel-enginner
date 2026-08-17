import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';

import { useSubmitCommandMutation, useSubmitSyncMutation } from '../control-api';
import type { CommandApi, CommandInput, SyncCommandInput } from '../api-types';
import { CommandOperationsPanel } from './CommandOperationsPanel';

type RtkCommandOperationsPanelProps = {
  readonly workspaceId: string | undefined;
  readonly bookId: string | undefined;
  readonly onCommandCompleted: (result: CommandResult) => Promise<void>;
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
