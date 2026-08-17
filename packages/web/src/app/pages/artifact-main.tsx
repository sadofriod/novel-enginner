import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import type { ArtifactProposalDetail } from '@novel-enginner/services/runtime/artifact-detail';

import { ArtifactDetail } from '../../components/ArtifactDetail';
import { BundledDiffView } from '../../components/BundledDiffView';
import { ProposalDiffView } from '../../components/ProposalDiffView';
import { ReviewerResultView } from '../../components/ReviewerResultView';
import { DerivedGraphView } from '../components/DerivedGraphView';

const EMPTY_PROPOSAL_DETAIL: ArtifactProposalDetail = {
  basedOnCanonicalVersion: 'unknown',
  diffs: [],
};

export interface ArtifactMainPanelProps {
  readonly selectedArtifact: ArtifactSummary | undefined;
  readonly workspaceId: string;
  readonly bookId: string;
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

export function ArtifactMainPanel({ selectedArtifact, workspaceId, bookId }: ArtifactMainPanelProps) {
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
