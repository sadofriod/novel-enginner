import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandAcceptedResponse } from '@novel-enginner/services/runtime/command-handler';
import type { CommandRecord } from '@novel-enginner/services/runtime/store';
import type { ApprovalAction } from './components/ArtifactDetail';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ControlConsoleMainPanel } from './components/ControlConsoleMainPanel';
import { RunTracePanel } from './components/RunTracePanel';

export interface ControlConsoleProps {
  readonly artifacts?: readonly ArtifactSummary[];
  readonly runs?: readonly RunRecord[];
  readonly selectedArtifact?: ArtifactSummary;
  readonly onSelectArtifact?: (artifact: ArtifactSummary) => void;
  readonly onAction?: (artifact: ArtifactSummary, action: ApprovalAction, note?: string) => void;
  readonly commandPanel?: ReactNode;
  readonly lastCommand?: CommandAcceptedResponse;
  readonly lastCommandRecord?: CommandRecord;
  readonly lastCommandRun?: RunRecord;
}

/**
 * @deprecated Legacy 3-column approval console. Superseded by the Workbench SPA
 * (`app/pages/workspace-workbench.tsx` + `WorkbenchDrawer`), which renders the diff
 * in the center area with GitHub-PR-review-style inline threads. Kept for reference;
 * not routed. Do not port new features here.
 */
export function ControlConsole({
  artifacts = [],
  runs = [],
  selectedArtifact,
  onSelectArtifact,
  onAction,
  commandPanel,
  lastCommand,
  lastCommandRecord,
  lastCommandRun,
}: ControlConsoleProps) {
  const visibleArtifacts = artifacts;
  const visibleRuns = runs;

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
        lastCommand={lastCommand}
        lastCommandRecord={lastCommandRecord}
        lastCommandRun={lastCommandRun}
        commandPanel={commandPanel}
        onAction={handleAction}
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
