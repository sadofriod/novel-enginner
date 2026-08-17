import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

import { RunTracePanel } from '../../components/RunTracePanel';

import { SystemCommandForm } from './system-operations';

export interface RunControlPanelProps {
  readonly runs: readonly RunRecord[];
  readonly selectedArtifact: ArtifactSummary | undefined;
  readonly workspaceId: string;
  readonly bookId: string;
}

function RunControlRow({
  run,
  workspaceId,
  bookId,
}: {
  readonly run: RunRecord;
  readonly workspaceId: string;
  readonly bookId: string;
}) {
  const artifact = { ...run, artifactType: run.artifactType ?? '', targetId: run.targetId ?? '' } as ArtifactSummary;
  return (
    <div className="run-control-row">
      <code>{run.runId}</code>
      <span>{run.status}</span>
      <div className="command-actions">
        <SystemCommandForm intent="resume-run" label="恢复" workspaceId={workspaceId} bookId={bookId} artifact={artifact} />
        <SystemCommandForm intent="retry-step" label="重试" workspaceId={workspaceId} bookId={bookId} artifact={artifact} />
        <SystemCommandForm intent="abort-run" label="中止" workspaceId={workspaceId} bookId={bookId} artifact={artifact} />
      </div>
    </div>
  );
}

export function RunControlPanel({
  runs,
  selectedArtifact,
  workspaceId,
  bookId,
}: RunControlPanelProps) {
  const visibleRuns = selectedArtifact === undefined
    ? runs
    : runs.filter((run) => run.artifactType === selectedArtifact.artifactType && run.targetId === selectedArtifact.targetId);
  return (
    <aside className="panel run-control-panel">
      <RunTracePanel runs={runs} selectedArtifact={selectedArtifact} />
      <h3>运行控制</h3>
      {visibleRuns.length === 0 ? (
        <p>没有可控制的运行。</p>
      ) : (
        visibleRuns.map((run) => (
          <RunControlRow key={run.runId} run={run} workspaceId={workspaceId} bookId={bookId} />
        ))
      )}
    </aside>
  );
}
