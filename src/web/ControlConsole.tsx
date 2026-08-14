/* eslint-disable complexity */

import { useEffect, useMemo, useState } from 'react';

import type { ArtifactSummary, RunRecord } from '../runtime/store';
import { ApiClient } from './api-client';
import { GraphCanvas } from './app/components/GraphCanvas';
import { DerivedGraphView } from './app/components/DerivedGraphView';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ArtifactDetail, type ApprovalAction } from './components/ArtifactDetail';
import { BundledDiffView } from './components/BundledDiffView';
import { ProposalDiffView } from './components/ProposalDiffView';
import { ReviewerResultView } from './components/ReviewerResultView';

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
  readonly selectedArtifact?: ArtifactSummary | undefined;
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

  const STATUS_COLORS: Record<string, string> = {
    running: '#1976d2',
    completed: '#2e7d32',
    failed: '#c62828',
    aborted: '#f57f17',
  };

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

      <main
        style={{
          display: 'grid',
          gap: '12px',
        }}
      >
        {selected === undefined ? (
          <p style={{ color: '#9e9e9e', fontSize: '14px' }}>暂无可审批工件。</p>
        ) : (
          <>
            <ArtifactDetail artifact={selected} onAction={handleAction} pending={selected.proposalStatus === 'commit-blocked' || selected.proposalStatus === 'waiting-sync'} />
            <ProposalDiffView
              proposalId={selected.activeProposalId ?? 'proposal-missing'}
              artifactType={selected.artifactType}
              targetId={selected.targetId}
              basedOnCanonicalVersion={selected.proposalDetail?.basedOnCanonicalVersion ?? 'unknown'}
              diffs={selected.proposalDetail?.diffs ?? []}
              entityVersionRefs={selected.proposalDetail?.entityVersionRefs}
            />
            <BundledDiffView
              proposalId={selected.activeProposalId ?? 'proposal-missing'}
              entries={selected.bundledDiff ?? []}
            />
            {selected.reviewerResult !== undefined && <ReviewerResultView result={selected.reviewerResult} />}
            {selected.derivedGraph !== undefined ? (
              <InteractiveDerivedGraph graph={selected.derivedGraph} />
            ) : (
              <DerivedGraphView graph={undefined} />
            )}
          </>
        )}
      </main>

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

function InteractiveDerivedGraph({ graph }: { readonly graph: NonNullable<ArtifactSummary['derivedGraph']> }) {
  const STATUS_STYLES: Record<string, { background: string; color: string; border: string }> = {
    ready:      { background: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
    stale:      { background: '#fff8e1', color: '#f57f17', border: '#ffe082' },
    rebuilding: { background: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
  };
  const statusStyle = STATUS_STYLES[graph.status] ?? { background: '#f5f5f5', color: '#616161', border: '#e0e0e0' };

  return (
    <section
      aria-label="剧情图谱 / 派生状态"
      style={{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#212121' }}>剧情图谱 / 派生状态</h3>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            background: statusStyle.background,
            color: statusStyle.color,
            border: `1px solid ${statusStyle.border}`,
          }}
        >
          {graph.status}
        </span>
        <span style={{ fontSize: '12px', color: '#9e9e9e' }}>
          {graph.nodes.length} 个节点 / {graph.edges.length} 条边
        </span>
      </div>
      {graph.nodes.length > 0 && (
        <GraphCanvas graph={graph} height={420} />
      )}
      {graph.status === 'stale' && (
        <div
          role="status"
          style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ffe082', background: '#fff8e1', fontSize: '12px', color: '#f57f17' }}
        >
          图谱快照尚未追平最新 canonical 版本，当前展示的节点/边可能不是最新状态。
        </div>
      )}
    </section>
  );
}
