/**
 * Bundled diff view: shows the character/fact/relationship/resource state diffs that
 * accompany a `chapter-manuscript` proposal (§6.3 and §4.2 §4 canonical commit rule):
 *
 * "某些 proposal 会携带结构化附属 diff，例如 chapter-manuscript 通过时附带的
 * character-update（宿主 mutable fields）、fact-update、relationship-update、
 * resource-update、plot-clue、faction/location/tech-rule 变更；这些 diff 属于同一个
 * proposal 的提交内容，而不是额外碎片审批单。"
 *
 * V1 renders the bundled diffs as a structured preview so the author can verify what
 * will be atomically committed before approving the manuscript.
 */

export interface BundledDiffEntry {
  readonly artifactType: string;
  readonly targetId: string;
  readonly changeKind: 'create' | 'update' | 'delete';
  readonly summary: string;
  readonly fields?: ReadonlyArray<{ field: string; before?: unknown; after?: unknown }>;
}

export interface BundledDiffViewProps {
  readonly proposalId: string;
  readonly entries: readonly BundledDiffEntry[];
}

const CHANGE_KIND_LABEL: Record<BundledDiffEntry['changeKind'], string> = {
  create: '新增',
  update: '变更',
  delete: '删除',
};

function BundledDiffEntryRow({ entry }: { entry: BundledDiffEntry }) {
  return (
    <li className={`bundled-diff-entry bundled-diff-${entry.changeKind}`}>
      <header className="bundled-entry-header">
        <span className={`bundled-kind-badge bundled-kind-${entry.changeKind}`}>
          {CHANGE_KIND_LABEL[entry.changeKind]}
        </span>
        <span className="bundled-artifact-type">{entry.artifactType}</span>
        <code className="bundled-target-id">{entry.targetId}</code>
      </header>
      <p className="bundled-summary">{entry.summary}</p>
      {entry.fields !== undefined && entry.fields.length > 0 && (
        <table className="bundled-fields-table">
          <thead>
            <tr>
              <th scope="col">字段</th>
              <th scope="col">修改前</th>
              <th scope="col">修改后</th>
            </tr>
          </thead>
          <tbody>
            {entry.fields.map((field) => (
              <tr key={field.field}>
                <td><code>{field.field}</code></td>
                <td>
                  {field.before !== undefined ? (
                    <pre className="bundled-field-value">{JSON.stringify(field.before)}</pre>
                  ) : (
                    <span className="bundled-empty">—</span>
                  )}
                </td>
                <td>
                  {field.after !== undefined ? (
                    <pre className="bundled-field-value bundled-field-after">{JSON.stringify(field.after)}</pre>
                  ) : (
                    <span className="bundled-empty">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

/**
 * Bundled state diff / patch set preview panel for `chapter-manuscript` proposals
 * (docs/architecture/modules/06-web-console-and-approval.md §6.8).
 * All entries in this list will be committed atomically if the proposal is approved.
 */
export function BundledDiffView({ proposalId, entries }: BundledDiffViewProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section aria-label="关联状态变更预览 (Bundled Diff)" className="bundled-diff">
      <header>
        <h3>关联状态变更（原子提交）</h3>
        <p>
          以下 {entries.length} 项变更将在批准 proposal <code>{proposalId}</code> 后与主工件原子提交：
        </p>
      </header>
      <ul className="bundled-diff-list">
        {entries.map((entry) => (
          <BundledDiffEntryRow key={`${entry.artifactType}::${entry.targetId}`} entry={entry} />
        ))}
      </ul>
    </section>
  );
}
