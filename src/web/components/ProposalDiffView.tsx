/* eslint-disable complexity */

import type { ArtifactFieldDiff, ArtifactEntityVersionRef } from '../../runtime/artifact-detail';

/**
 * Proposal diff view (docs/architecture/modules/06-web-console-and-approval.md §6.8):
 * shows the "proposal vs canonical" diff in the artifact detail page. V1 displays a
 * structured field-by-field comparison rather than a raw text diff, since proposals are
 * structured JSON/Markdown objects rather than free text.
 */

export interface ProposalDiffViewProps {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly basedOnCanonicalVersion: string;
  readonly diffs: readonly ArtifactFieldDiff[];
  readonly entityVersionRefs?: readonly ArtifactEntityVersionRef[] | undefined;
}

function DiffRow({ field, canonical, proposed, changed }: ArtifactFieldDiff) {
  return (
    <tr className={changed ? 'diff-row diff-changed' : 'diff-row diff-unchanged'}>
      <td className="diff-field">
        <code>{field}</code>
        {changed && <span className="diff-badge">changed</span>}
      </td>
      <td className="diff-canonical">
        {canonical !== undefined ? (
          <pre className="diff-value">{typeof canonical === 'string' ? canonical : JSON.stringify(canonical, null, 2)}</pre>
        ) : (
          <span className="diff-empty">—</span>
        )}
      </td>
      <td className="diff-proposed">
        {proposed !== undefined ? (
          <pre className={changed ? 'diff-value diff-value-changed' : 'diff-value'}>
            {typeof proposed === 'string' ? proposed : JSON.stringify(proposed, null, 2)}
          </pre>
        ) : (
          <span className="diff-empty">—</span>
        )}
      </td>
    </tr>
  );
}

export function ProposalDiffView({
  proposalId,
  artifactType,
  targetId,
  basedOnCanonicalVersion,
  diffs,
  entityVersionRefs,
}: ProposalDiffViewProps) {
  const changedCount = diffs.filter((d) => d.changed).length;

  return (
    <section aria-label="Proposal vs Canonical 差异" className="proposal-diff">
      <header>
        <h3>Proposal 差异视图</h3>
        <dl className="proposal-diff-meta">
          <dt>proposalId</dt><dd>{proposalId}</dd>
          <dt>artifactType</dt><dd>{artifactType}</dd>
          <dt>targetId</dt><dd>{targetId}</dd>
          <dt>basedOnCanonicalVersion</dt><dd><code>{basedOnCanonicalVersion}</code></dd>
        </dl>
        <p className="diff-summary">
          {changedCount === 0
            ? '无字段变更'
            : `${changedCount} 个字段发生变更（共 ${diffs.length} 个字段）`}
        </p>
      </header>

      {entityVersionRefs !== undefined && entityVersionRefs.length > 0 && (
        <section aria-label="实体版本引用" className="entity-version-refs">
          <h4>实体版本引用 (entityVersionRefs)</h4>
          <ul>
            {entityVersionRefs.map(({ entityId, version }) => (
              <li key={entityId}>
                <code>{entityId}</code> @ <code>{version}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="diff-table">
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th scope="col">当前 canonical</th>
            <th scope="col">Proposal 内容</th>
          </tr>
        </thead>
        <tbody>
          {diffs.length === 0 ? (
            <tr>
              <td colSpan={3} className="diff-empty">暂无字段对比数据。</td>
            </tr>
          ) : (
            diffs.map((diff) => (
              <DiffRow
                key={diff.field}
                field={diff.field}
                canonical={diff.canonical}
                proposed={diff.proposed}
                changed={diff.changed}
              />
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
