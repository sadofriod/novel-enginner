import { renderToStaticMarkup } from 'react-dom/server';

import type { ArtifactSummary, RunRecord } from '../../../runtime/store';
import { ArtifactDetail } from '../../components/ArtifactDetail';
import { BundledDiffView } from '../../components/BundledDiffView';
import { ProposalDiffView } from '../../components/ProposalDiffView';
import { ReviewerResultView } from '../../components/ReviewerResultView';
import { RunTracePanel } from '../../ControlConsole';
import { DerivedGraphView } from '../components/DerivedGraphView';
import type { ArtifactProposalDetail } from '../../../runtime/artifact-detail';

export interface ControlConsolePageProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly runs: readonly RunRecord[];
  readonly selectedArtifact?: ArtifactSummary | undefined;
  readonly workspaceId: string;
  readonly bookId: string;
}

export function renderControlConsolePage(props: ControlConsolePageProps): string {
  return `<!doctype html>${renderToStaticMarkup(<ControlConsolePage {...props} />)}`;
}

const EMPTY_PROPOSAL_DETAIL: ArtifactProposalDetail = {
  basedOnCanonicalVersion: 'unknown',
  diffs: [],
};

function ControlConsolePage({
  artifacts,
  runs,
  selectedArtifact,
  workspaceId,
  bookId,
}: ControlConsolePageProps) {
  const selected = resolveSelectedArtifact(artifacts, selectedArtifact);
  const relatedRun = findRelatedRun(runs, selected);

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <title>Novel Enginner Web Console</title>
        <style>{PAGE_CSS}</style>
      </head>
      <body>
        <main className="page-shell">
          <header className="page-header">
            <div>
              <p className="eyebrow">Novel Enginner</p>
              <h1>Web 控制台</h1>
              <p>审批、运行追溯、Reviewer、Bundled Diff 与派生图谱都在同一入口可见。</p>
            </div>
            <dl className="page-meta">
              <dt>workspaceId</dt>
              <dd>{workspaceId}</dd>
              <dt>bookId</dt>
              <dd>{bookId}</dd>
            </dl>
          </header>

          <div className="layout-grid">
            <ArtifactQueuePanel artifacts={artifacts} selectedArtifact={selected} />
            <ArtifactMainPanel
              selectedArtifact={selected}
              workspaceId={workspaceId}
              bookId={bookId}
            />

            <aside className="panel">
              <RunTracePanel runs={runs} selectedArtifact={selected} />
            </aside>
          </div>
        </main>
        <LiveRefreshScript runId={relatedRun?.runId} />
      </body>
    </html>
  );
}

function resolveSelectedArtifact(
  artifacts: readonly ArtifactSummary[],
  selectedArtifact: ArtifactSummary | undefined,
): ArtifactSummary | undefined {
  return selectedArtifact ?? artifacts[0];
}

function findRelatedRun(
  runs: readonly RunRecord[],
  selectedArtifact: ArtifactSummary | undefined,
): RunRecord | undefined {
  if (selectedArtifact === undefined) {
    return undefined;
  }
  return runs.find((run) => run.artifactType === selectedArtifact.artifactType && run.targetId === selectedArtifact.targetId);
}

function ArtifactQueuePanel({
  artifacts,
  selectedArtifact,
}: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedArtifact: ArtifactSummary | undefined;
}) {
  return (
    <aside className="panel">
      <h2>任务 / 审批队列</h2>
      {artifacts.length === 0 ? <p>暂无待处理 proposal。</p> : <ArtifactLinkList artifacts={artifacts} selectedArtifact={selectedArtifact} />}
    </aside>
  );
}

function ArtifactLinkList({
  artifacts,
  selectedArtifact,
}: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedArtifact: ArtifactSummary | undefined;
}) {
  return (
    <ul className="artifact-links">
      {artifacts.map((artifact) => (
        <ArtifactLink
          key={`${artifact.artifactType}::${artifact.targetId}`}
          artifact={artifact}
          selected={selectedArtifact?.artifactType === artifact.artifactType && selectedArtifact.targetId === artifact.targetId}
        />
      ))}
    </ul>
  );
}

function ArtifactLink({ artifact, selected }: { readonly artifact: ArtifactSummary; readonly selected: boolean }) {
  const href = `/app?artifactType=${encodeURIComponent(artifact.artifactType)}&targetId=${encodeURIComponent(artifact.targetId)}`;
  return (
    <li>
      <a href={href} className={selected ? 'artifact-link artifact-link-selected' : 'artifact-link'}>
        <strong>{artifact.artifactType}</strong>
        <span>{artifact.targetId}</span>
        <small>{artifact.proposalStatus ?? 'no-active-proposal'}</small>
      </a>
    </li>
  );
}

function ArtifactMainPanel({
  selectedArtifact,
  workspaceId,
  bookId,
}: {
  readonly selectedArtifact: ArtifactSummary | undefined;
  readonly workspaceId: string;
  readonly bookId: string;
}) {
  if (selectedArtifact === undefined) {
    return (
      <section className="panel panel-main">
        <p>暂无可审批工件。</p>
      </section>
    );
  }
  return (
    <section className="panel panel-main">
      <ArtifactDetail
        artifact={selectedArtifact}
        pending={selectedArtifact.proposalStatus === 'commit-blocked' || selectedArtifact.proposalStatus === 'waiting-sync'}
        onAction={() => undefined}
        actionForm={{
          actionPath: '/app/actions/command',
          workspaceId,
          bookId,
          redirectTo: `/app?artifactType=${encodeURIComponent(selectedArtifact.artifactType)}&targetId=${encodeURIComponent(selectedArtifact.targetId)}`,
        }}
      />
      <ProposalDiffSection artifact={selectedArtifact} />
      <BundledDiffView
        proposalId={selectedArtifact.activeProposalId ?? 'proposal-missing'}
        entries={selectedArtifact.bundledDiff ?? []}
      />
      <ReviewerSection artifact={selectedArtifact} />
      <DerivedGraphView graph={selectedArtifact.derivedGraph} />
    </section>
  );
}

function ProposalDiffSection({ artifact }: { readonly artifact: ArtifactSummary }) {
  const proposalId = artifact.activeProposalId ?? 'proposal-missing';
  const proposalDetail = artifact.proposalDetail ?? EMPTY_PROPOSAL_DETAIL;
  return (
    <ProposalDiffView
      proposalId={proposalId}
      artifactType={artifact.artifactType}
      targetId={artifact.targetId}
      basedOnCanonicalVersion={proposalDetail.basedOnCanonicalVersion}
      diffs={proposalDetail.diffs}
      entityVersionRefs={proposalDetail.entityVersionRefs}
    />
  );
}

function ReviewerSection({ artifact }: { readonly artifact: ArtifactSummary }) {
  return artifact.reviewerResult === undefined ? null : <ReviewerResultView result={artifact.reviewerResult} />;
}

function LiveRefreshScript({ runId }: { readonly runId: string | undefined }) {
  if (runId === undefined) {
    return null;
  }
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `const stream = new EventSource('/runs/${runId}/stream');
for (const eventName of ['run.step.completed','run.completed','run.aborted','workspace.invalid','workspace.valid','artifact.approved','artifact.canonical-committed']) {
  stream.addEventListener(eventName, () => window.location.reload());
}
window.addEventListener('beforeunload', () => stream.close());`,
      }}
    />
  );
}

const PAGE_CSS = `
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f5f7fb; color: #1f2937; }
.page-shell { padding: 24px; display: grid; gap: 20px; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: start; }
.page-meta { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; }
.eyebrow { margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
.layout-grid { display: grid; grid-template-columns: 280px 1fr 320px; gap: 16px; align-items: start; }
.panel { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08); }
.panel-main { display: grid; gap: 16px; }
.artifact-links { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.artifact-link { display: grid; gap: 4px; padding: 12px; border: 1px solid #dbe3f0; border-radius: 10px; color: inherit; text-decoration: none; }
.artifact-link-selected { border-color: #2563eb; background: #eff6ff; }
.artifact-meta, .proposal-diff-meta, .derived-graph-meta { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
.approval-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.approval-action-form { margin: 0; }
.approval-action-form button { padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
.inline-edit textarea { width: 100%; }
.diff-table, .bundled-fields-table { width: 100%; border-collapse: collapse; }
.diff-table th, .diff-table td, .bundled-fields-table th, .bundled-fields-table td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; }
.diff-value, .bundled-field-value { white-space: pre-wrap; margin: 0; }
.run-trace-list, .bundled-diff-list { padding-left: 18px; }
.derived-graph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
`;
