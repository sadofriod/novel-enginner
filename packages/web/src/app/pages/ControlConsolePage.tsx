import { renderToStaticMarkup } from 'react-dom/server';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

import { ArtifactMainPanel } from './artifact-main';
import { ArtifactQueuePanel } from './artifact-queue';
import { LiveRefreshScript } from './live-refresh';
import { PAGE_CSS } from './page-css';
import { RunControlPanel } from './run-control';
import { SystemOperationsPanel } from './system-operations';

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

          <SystemOperationsPanel
            workspaceId={workspaceId}
            bookId={bookId}
            selectedArtifact={selected}
          />

          <div className="layout-grid">
            <ArtifactQueuePanel artifacts={artifacts} selectedArtifact={selected} />
            <ArtifactMainPanel
              selectedArtifact={selected}
              workspaceId={workspaceId}
              bookId={bookId}
            />

            <RunControlPanel runs={runs} selectedArtifact={selected} workspaceId={workspaceId} bookId={bookId} />
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
