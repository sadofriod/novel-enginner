import { renderToStaticMarkup } from 'react-dom/server';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import { ArtifactDetail } from '../../components/ArtifactDetail';
import { BundledDiffView } from '../../components/BundledDiffView';
import { ProposalDiffView } from '../../components/ProposalDiffView';
import { ReviewerResultView } from '../../components/ReviewerResultView';
import { RunTracePanel } from '../../ControlConsole';
import { DerivedGraphView } from '../components/DerivedGraphView';
import type { ArtifactProposalDetail } from '@novel-enginner/services/runtime/artifact-detail';

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
        <script src="/assets/client.js" defer />
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
          actionPath: '/api/app/actions/command',
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
        __html: `const stream = new EventSource('/api/runs/${runId}/stream');
for (const eventName of ['run.step.completed','run.completed','run.aborted','workspace.invalid','workspace.valid','artifact.approved','artifact.canonical-committed']) {
  stream.addEventListener(eventName, () => window.location.reload());
}
window.addEventListener('beforeunload', () => stream.close());`,
      }}
    />
  );
}

const PAGE_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;background:#f5f7fb;color:#212121;line-height:1.5}
h1,h2,h3,h4{margin:0;font-weight:700;color:#212121}
p{margin:0}
a{color:#1976d2;text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,monospace;font-size:0.85em;background:#f5f5f5;padding:1px 4px;border-radius:2px}

/* Page shell */
.page-shell{padding:20px;display:grid;gap:16px;max-width:1600px;margin:0 auto}
.page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:16px;background:#fff;border:1px solid #e0e0e0;border-radius:4px}
.page-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:12px}
.page-meta dt{color:#9e9e9e;font-weight:500}
.page-meta dd{margin:0;font-family:monospace;color:#424242}
.eyebrow{margin:0 0 4px;font-size:11px;color:#9e9e9e;text-transform:uppercase;letter-spacing:0.08em}
.layout-grid{display:grid;grid-template-columns:260px 1fr 300px;gap:12px;align-items:start}

/* Panel */
.panel{background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:14px}
.panel-main{display:grid;gap:12px}

/* Artifact links */
.artifact-links{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.artifact-link{display:grid;gap:3px;padding:10px 12px;border:1px solid #e0e0e0;border-radius:4px;color:inherit;text-decoration:none;transition:border-color 0.15s,background 0.15s}
.artifact-link:hover{border-color:#90caf9;background:#f8fbff}
.artifact-link-selected{border-color:#1976d2 !important;background:#e3f2fd !important}
.artifact-link strong{font-size:13px;color:#212121}
.artifact-link span{font-size:12px;color:#616161}
.artifact-link small{display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f5f5f5;color:#616161}

/* Artifact meta */
.artifact-meta,.proposal-diff-meta,.derived-graph-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px}
.artifact-meta dt,.proposal-diff-meta dt,.derived-graph-meta dt{color:#9e9e9e;font-weight:500;white-space:nowrap}
.artifact-meta dd,.proposal-diff-meta dd,.derived-graph-meta dd{margin:0;font-family:monospace;color:#424242}

/* Approval actions */
.approval-actions{display:flex;flex-wrap:wrap;gap:8px}
.approval-action-form{margin:0}
.approval-action-form button{padding:6px 14px;border-radius:4px;border:1px solid #9e9e9e;background:#fff;cursor:pointer;font-size:13px}

/* Inline edit */
.inline-edit textarea{width:100%;padding:8px;border:1px solid #bdbdbd;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit}

/* Tables */
.diff-table,.bundled-fields-table{width:100%;border-collapse:collapse}
.diff-table th,.diff-table td,.bundled-fields-table th,.bundled-fields-table td{border:1px solid #e0e0e0;padding:6px 8px;vertical-align:top;font-size:12px}
.diff-table th,.bundled-fields-table th{background:#fafafa;font-weight:600}
.diff-value,.bundled-field-value{white-space:pre-wrap;margin:0}

/* Run trace */
.run-trace-list,.bundled-diff-list{padding-left:18px}

/* Derived graph */
.derived-graph-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
`;
