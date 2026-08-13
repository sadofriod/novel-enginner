import { useEffect, useMemo, useState } from 'react';

import type { ArtifactSummary, RunRecord } from '../runtime/store';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ArtifactDetail, type ApprovalAction } from './components/ArtifactDetail';

export interface ControlConsoleProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly runs?: readonly RunRecord[];
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
  artifacts,
  runs = [],
  selectedArtifact,
  onSelectArtifact,
  onAction,
}: ControlConsoleProps) {
  const defaultSelected = useMemo(() => {
    if (selectedArtifact !== undefined) {
      return selectedArtifact;
    }

    return artifacts[0];
  }, [artifacts, selectedArtifact]);

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

    return artifacts.find(
      (artifact) => `${artifact.artifactType}::${artifact.targetId}` === selectedKey,
    );
  }, [artifacts, selectedKey, defaultSelected]);

  const handleSelect = (artifact: ArtifactSummary) => {
    setSelectedKey(`${artifact.artifactType}::${artifact.targetId}`);
    onSelectArtifact?.(artifact);
  };

  const handleAction = (action: ApprovalAction, note?: string) => {
    if (selected !== undefined) {
      onAction?.(selected, action, note);
    }
  };

  return (
    <div className="control-console" aria-label="Web Control Console">
      <aside className="control-console-sidebar">
        <h2>任务 / 审批队列</h2>
        <ApprovalQueue
          artifacts={artifacts}
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
          runs={runs}
          {...(selected === undefined ? {} : { selectedArtifact: selected })}
        />
      </aside>
    </div>
  );
}
