import { useMemo } from 'react';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

export interface RunTracePanelProps {
  readonly runs?: readonly RunRecord[];
  readonly selectedArtifact?: ArtifactSummary | undefined;
}

const STATUS_COLORS: Record<string, string> = {
  running: '#1976d2',
  completed: '#2e7d32',
  failed: '#c62828',
  aborted: '#f57f17',
};

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
    <section aria-label="运行追溯">
      <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#212121' }}>运行追溯</h3>
      {visibleRuns.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#9e9e9e', margin: 0 }}>暂无关联运行记录。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px' }}>
          {visibleRuns.map((run) => (
            <li
              key={run.runId}
              style={{
                padding: '8px 10px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                fontSize: '12px',
                display: 'grid',
                gap: '3px',
              }}
            >
              <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#212121', wordBreak: 'break-all' }}>
                {run.runId}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: '#f5f5f5',
                  color: STATUS_COLORS[run.status] ?? '#616161',
                  fontWeight: 600,
                  fontSize: '11px',
                  width: 'fit-content',
                }}
              >
                {run.status}
              </span>
              {run.nextExpectedState !== undefined && (
                <small style={{ color: '#9e9e9e' }}>{run.nextExpectedState}</small>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
