export function LiveRefreshScript({ runId }: { readonly runId: string | undefined }) {
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
