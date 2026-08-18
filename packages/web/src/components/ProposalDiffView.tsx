import ReactDiffViewer from 'react-diff-viewer-continued';

import type { ArtifactFieldDiff, ArtifactEntityVersionRef } from '@novel-enginner/services/runtime/artifact-detail';

/**
 * Proposal diff view (docs/architecture/modules/06-web-console-and-approval.md §6.8):
 * shows the "proposal vs canonical" diff in the artifact detail page. V1 renders each
 * changed field with an open-source GitHub-style line diff
 * (`react-diff-viewer-continued`) instead of raw text blocks, so added/removed lines
 * are highlighted like a GitHub pull request.
 */

export interface ProposalDiffViewProps {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly basedOnCanonicalVersion: string;
  readonly diffs: readonly ArtifactFieldDiff[];
  readonly entityVersionRefs?: readonly ArtifactEntityVersionRef[] | undefined;
}

/** Coerces a diff value to text; objects are pretty-printed so the line diff stays readable. */
function valueToText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function FieldDiff({ diff }: { readonly diff: ArtifactFieldDiff }) {
  return (
    <div className="diff-field-block">
      <div className="diff-field-head">
        <code>{diff.field}</code>
        {diff.changed && <span className="diff-badge">changed</span>}
      </div>
      <ReactDiffViewer
        oldValue={valueToText(diff.canonical)}
        newValue={valueToText(diff.proposed)}
        splitView={false}
        showDiffOnly
      />
    </div>
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

      {diffs.length === 0 ? (
        <p className="diff-empty">暂无字段对比数据。</p>
      ) : (
        diffs.map((diff) => <FieldDiff key={diff.field} diff={diff} />)
      )}
    </section>
  );
}
