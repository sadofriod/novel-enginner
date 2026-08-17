import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

export interface SystemOperationsPanelProps {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly selectedArtifact: ArtifactSummary | undefined;
}

export function SystemOperationsPanel({
  workspaceId,
  bookId,
  selectedArtifact,
}: SystemOperationsPanelProps) {
  return (
    <section className="panel system-operations" aria-label="系统操作">
      <div>
        <h2>系统操作</h2>
        <p>把 CLI 中的工作区同步、图谱重建和任务生成能力放到这里。</p>
      </div>
      <div className="command-actions">
        <SystemCommandForm intent="re-sync-state" label="同步工作区" workspaceId={workspaceId} bookId={bookId} />
        <SystemCommandForm intent="rebuild-graph" label="重建剧情图谱" workspaceId={workspaceId} bookId={bookId} />
        {selectedArtifact === undefined ? null : (
          <>
            <SystemCommandForm intent="propose" label="生成提案" workspaceId={workspaceId} bookId={bookId} artifact={selectedArtifact} />
            <SystemCommandForm intent="regenerate" label="重新生成提案" workspaceId={workspaceId} bookId={bookId} artifact={selectedArtifact} />
          </>
        )}
      </div>
    </section>
  );
}

export function SystemCommandForm({
  intent,
  label,
  workspaceId,
  bookId,
  artifact,
}: {
  readonly intent: string;
  readonly label: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifact?: ArtifactSummary;
}) {
  return (
    <form method="post" action="/api/app/actions/system-command" className="command-form">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="redirectTo" value={window.location.pathname + window.location.search} />
      {artifact === undefined ? null : (
        <>
          <input type="hidden" name="artifactType" value={artifact.artifactType} />
          <input type="hidden" name="targetId" value={artifact.targetId} />
        </>
      )}
      <button type="submit">{label}</button>
    </form>
  );
}
