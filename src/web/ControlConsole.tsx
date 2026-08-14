import { useEffect, useMemo, useState } from 'react';

import type { ArtifactSummary, RunRecord } from '../runtime/store';
import { ApiClient } from './api-client';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ArtifactDetail, type ApprovalAction } from './components/ArtifactDetail';

export interface ControlConsoleProps {
  readonly artifacts?: readonly ArtifactSummary[];
  readonly runs?: readonly RunRecord[];
  readonly apiClient?: ApiClient;
  readonly workspaceId?: string;
  readonly bookId?: string;
  readonly selectedArtifact?: ArtifactSummary;
  readonly onSelectArtifact?: (artifact: ArtifactSummary) => void;
  readonly onAction?: (artifact: ArtifactSummary, action: ApprovalAction, note?: string) => void;
}

export interface RunTracePanelProps {
  readonly runs?: readonly RunRecord[];
  readonly selectedArtifact?: ArtifactSummary;
}

export function RunTracePanel({ runs = [], selectedArtifact }: RunTracePanelProps) {
  const visibleRuns = useMemo(() => {
    if (selectedArtifact === undefined) {
      return runs;
    }

    return runs.filter(
      (run) =>
        run.artifactType === selectedArtifact.artifactType &&
        run.targetId === selectedArtifact.targetId,
    );
  }, [runs, selectedArtifact]);

  return (
    <section aria-label="运行追溯" className="run-trace-panel">
      <header>
        <h3>运行追溯</h3>
      </header>
      {visibleRuns.length === 0 ? (
        <p>暂无关联运行记录。</p>
      ) : (
        <ul className="run-trace-list">
          {visibleRuns.map((run) => (
            <li key={run.runId}>
              <strong>{run.runId}</strong>
              <span>{run.status}</span>
              <small>{run.nextExpectedState}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
}: ControlConsoleProps) {
  const [remoteArtifacts, setRemoteArtifacts] = useState<readonly ArtifactSummary[]>(artifacts);
  const [remoteRuns, setRemoteRuns] = useState<readonly RunRecord[]>(runs);
  const visibleArtifacts = apiClient === undefined ? artifacts : remoteArtifacts;
  const visibleRuns = apiClient === undefined ? runs : remoteRuns;

  useEffect(() => {
    if (apiClient === undefined) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const [nextArtifacts, nextRuns] = await Promise.all([
        apiClient.listArtifacts(),
        apiClient.listRuns(),
      ]);
      if (cancelled) {
        return;
      }
      setRemoteArtifacts(nextArtifacts);
      setRemoteRuns(nextRuns);
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
    stream.addEventListener('run.step.completed', refresh);
    stream.addEventListener('run.completed', refresh);
    stream.addEventListener('run.aborted', refresh);
    stream.addEventListener('workspace.invalid', refresh);
    return () => {
      stream.close();
    };
  }, [apiClient, selected, visibleRuns]);

  const handleSelect = (artifact: ArtifactSummary) => {
    setSelectedKey(`${artifact.artifactType}::${artifact.targetId}`);
    onSelectArtifact?.(artifact);
  };

  const handleAction = (action: ApprovalAction, note?: string) => {
    if (selected !== undefined) {
      onAction?.(selected, action, note);
      if (
        apiClient !== undefined
        && workspaceId !== undefined
        && bookId !== undefined
        && action !== 'delete'
      ) {
        void apiClient.submitCommand({
          workspaceId,
          bookId,
          artifactType: selected.artifactType,
          targetId: selected.targetId,
          intent: action,
          requestedBy: 'author-local',
          approvalMode: 'manual',
          idempotencyKey: `web-${action}-${selected.targetId}-${Date.now().toString(36)}`,
        }).then(async () => {
          setRemoteArtifacts(await apiClient.listArtifacts());
          setRemoteRuns(await apiClient.listRuns());
        });
      }
    }
  };

  return (
    <div className="control-console" aria-label="Web Control Console">
      <aside className="control-console-sidebar">
        <h2>任务 / 审批队列</h2>
        <ApprovalQueue
          artifacts={visibleArtifacts}
          {...(selectedKey === undefined ? {} : { selectedKey })}
          onSelect={handleSelect}
        />
      </aside>

      <main className="control-console-main">
        {selected === undefined ? (
          <p>暂无可审批工件。</p>
        ) : (
          <ArtifactDetail artifact={selected} onAction={handleAction} pending={selected.proposalStatus === 'commit-blocked' || selected.proposalStatus === 'waiting-sync'} />
        )}
      </main>

      <aside className="control-console-side-panel">
        <RunTracePanel
          runs={visibleRuns}
          {...(selected === undefined ? {} : { selectedArtifact: selected })}
        />
      </aside>
    </div>
  );
}
