/* eslint-disable complexity */

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandAcceptedResponse, CommandResult } from '@novel-enginner/services/runtime/command-handler';
import type { CommandRecord } from '@novel-enginner/services/runtime/store';
import type { ApprovalAction } from './components/ArtifactDetail';
import { ApiClient } from './api-client';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ControlConsoleMainPanel } from './components/ControlConsoleMainPanel';
import { RunTracePanel } from './components/RunTracePanel';

export interface ControlConsoleProps {
  readonly artifacts?: readonly ArtifactSummary[];
  readonly runs?: readonly RunRecord[];
  readonly apiClient?: ApiClient;
  readonly workspaceId?: string;
  readonly bookId?: string;
  readonly selectedArtifact?: ArtifactSummary;
  readonly onSelectArtifact?: (artifact: ArtifactSummary) => void;
  readonly onAction?: (artifact: ArtifactSummary, action: ApprovalAction, note?: string) => void;
  readonly commandPanel?: ReactNode;
}

export function ControlConsole({
  artifacts = [],
  runs = [],
  apiClient,
  workspaceId,
  bookId,
  selectedArtifact,
  onSelectArtifact,
  onAction,
  commandPanel,
}: ControlConsoleProps) {
  const [remoteArtifacts, setRemoteArtifacts] = useState<readonly ArtifactSummary[]>(artifacts);
  const [remoteRuns, setRemoteRuns] = useState<readonly RunRecord[]>(runs);
  const [remoteWorkspace, setRemoteWorkspace] = useState<{ readonly workspaceId: string; readonly bookId: string }>();
  const [lastCommand, setLastCommand] = useState<CommandAcceptedResponse>();
  const [lastCommandRecord, setLastCommandRecord] = useState<CommandRecord>();
  const [lastCommandRun, setLastCommandRun] = useState<RunRecord>();
  const visibleArtifacts = apiClient === undefined ? artifacts : remoteArtifacts;
  const visibleRuns = apiClient === undefined ? runs : remoteRuns;
  const resolvedWorkspaceId = workspaceId ?? remoteWorkspace?.workspaceId;
  const resolvedBookId = bookId ?? remoteWorkspace?.bookId;

  const refreshConsole = async (): Promise<void> => {
    if (apiClient === undefined) {
      return;
    }
    const [nextArtifacts, nextRuns] = await Promise.all([
      apiClient.listArtifacts(),
      apiClient.listRuns(),
    ]);
    setRemoteArtifacts(nextArtifacts);
    setRemoteRuns(nextRuns);
  };

  useEffect(() => {
    if (apiClient === undefined) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const [nextArtifacts, nextRuns, nextWorkspace] = await Promise.all([
        apiClient.listArtifacts(),
        apiClient.listRuns(),
        apiClient.getBootstrapConfig(),
      ]);
      if (cancelled) {
        return;
      }
      setRemoteArtifacts(nextArtifacts);
      setRemoteRuns(nextRuns);
      setRemoteWorkspace({ workspaceId: nextWorkspace.workspaceId, bookId: nextWorkspace.bookId });
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const defaultSelected = useMemo(() => {
    if (selectedArtifact !== undefined) {
      return selectedArtifact;
    }

    return visibleArtifacts[0];
  }, [visibleArtifacts, selectedArtifact]);

  const [selectedKey, setSelectedKey] = useState<string | undefined>(() => {
    if (defaultSelected === undefined) {
      return undefined;
    }

    return `${defaultSelected.artifactType}::${defaultSelected.targetId}`;
  });

  useEffect(() => {
    if (defaultSelected === undefined) {
      setSelectedKey(undefined);
      return;
    }

    setSelectedKey(`${defaultSelected.artifactType}::${defaultSelected.targetId}`);
  }, [defaultSelected]);

  const selected = useMemo(() => {
    if (selectedKey === undefined) {
      return defaultSelected;
    }

    return visibleArtifacts.find(
      (artifact) => `${artifact.artifactType}::${artifact.targetId}` === selectedKey,
    );
  }, [visibleArtifacts, selectedKey, defaultSelected]);

  useEffect(() => {
    if (apiClient === undefined || selected === undefined) {
      return;
    }
    const relatedRun = visibleRuns.find(
      (run) => run.artifactType === selected.artifactType && run.targetId === selected.targetId,
    );
    if (relatedRun === undefined) {
      return;
    }

    const stream = apiClient.openRunStream(relatedRun.runId);
    const refresh = () => {
      void Promise.all([apiClient.listArtifacts(), apiClient.listRuns()]).then(([nextArtifacts, nextRuns]) => {
        setRemoteArtifacts(nextArtifacts);
        setRemoteRuns(nextRuns);
      });
    };
    for (const eventType of [
      'run.step.completed', 'run.step.failed', 'run.completed', 'run.aborted',
      'workspace.invalid', 'workspace.valid', 'derived.ready', 'derived.failed',
      'artifact.proposed', 'artifact.approved', 'artifact.override-approved',
      'artifact.rejected', 'artifact.exported', 'artifact.canonical-committed',
      'artifact.commit-blocked', 'artifact.review-stale',
    ]) {
      stream.addEventListener(eventType, refresh);
    }
    return () => {
      stream.close();
    };
  }, [apiClient, selected, visibleRuns]);

  const handleSelect = (artifact: ArtifactSummary) => {
    setSelectedKey(`${artifact.artifactType}::${artifact.targetId}`);
    onSelectArtifact?.(artifact);
    if (apiClient !== undefined) {
      void apiClient.getArtifact(artifact.artifactType, artifact.targetId).then((detail) => {
        if (detail !== undefined) {
          setRemoteArtifacts((currentArtifacts) => currentArtifacts.map((currentArtifact) => (
            currentArtifact.artifactType === detail.artifactType && currentArtifact.targetId === detail.targetId
              ? detail
              : currentArtifact
          )));
        }
      });
    }
  };

  const handleCommandCompleted = async (result: CommandResult): Promise<void> => {
    if (apiClient === undefined || result.status !== 'accepted') {
      return;
    }
    const [command, run] = await Promise.all([
      apiClient.getCommand(result.commandId),
      apiClient.getRun(result.runId),
    ]);
    setLastCommand(result);
    setLastCommandRecord(command);
    setLastCommandRun(run);
    await refreshConsole();
  };

  const handleAction = (action: ApprovalAction, note?: string) => {
    if (selected !== undefined) {
      onAction?.(selected, action, note);
      const contextRun = visibleRuns.find(
        (run) => run.artifactType === selected.artifactType && run.targetId === selected.targetId,
      );
      const actionWorkspaceId = resolvedWorkspaceId ?? contextRun?.workspaceId;
      const actionBookId = resolvedBookId ?? contextRun?.bookId;
      if (
        apiClient !== undefined
        && actionWorkspaceId !== undefined
        && actionBookId !== undefined
        && action !== 'delete'
      ) {
        void apiClient.submitCommand({
          workspaceId: actionWorkspaceId,
          bookId: actionBookId,
          artifactType: selected.artifactType,
          targetId: selected.targetId,
          intent: action,
          requestedBy: 'author-local',
          approvalMode: 'manual',
          idempotencyKey: `web-${action}-${selected.targetId}-${Date.now().toString(36)}`,
        }).then(refreshConsole);
      }
    }
  };

  return (
    <div
      aria-label="Web Control Console"
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 300px',
        gap: '12px',
        alignItems: 'start',
        minHeight: '100vh',
        padding: '16px',
        background: '#f5f7fb',
        boxSizing: 'border-box',
      }}
    >
      <aside
        style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '14px',
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#212121' }}>
          任务 / 审批队列
        </h2>
        <ApprovalQueue
          artifacts={visibleArtifacts}
          {...(selectedKey === undefined ? {} : { selectedKey })}
          onSelect={handleSelect}
        />
      </aside>

      <ControlConsoleMainPanel
        selected={selected}
        apiClient={apiClient}
        workspaceId={resolvedWorkspaceId}
        bookId={resolvedBookId}
        lastCommand={lastCommand}
        lastCommandRecord={lastCommandRecord}
        lastCommandRun={lastCommandRun}
        commandPanel={commandPanel}
        onAction={handleAction}
        onCommandCompleted={handleCommandCompleted}
      />
      <aside
        style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '14px',
        }}
      >
        <RunTracePanel
          runs={visibleRuns}
          {...(selected === undefined ? {} : { selectedArtifact: selected })}
        />
      </aside>
    </div>
  );
}
