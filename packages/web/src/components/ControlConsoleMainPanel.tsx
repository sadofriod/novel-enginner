/* eslint-disable complexity */
import type { ReactNode } from 'react';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandAcceptedResponse } from '@novel-enginner/services/runtime/command-handler';
import type { CommandRecord } from '@novel-enginner/services/runtime/store';

import { InteractiveDerivedGraph } from '../app/components/InteractiveDerivedGraph';
import { DerivedGraphView } from '../app/components/DerivedGraphView';
import { ArtifactDetail, type ApprovalAction } from './ArtifactDetail';
import { BundledDiffView } from './BundledDiffView';
import { CommandReceiptPanel } from './CommandReceiptPanel';
import { ProposalDiffView } from './ProposalDiffView';
import { ReviewerResultView } from './ReviewerResultView';

export interface ControlConsoleMainPanelProps {
  readonly selected: ArtifactSummary | undefined;
  readonly lastCommand: CommandAcceptedResponse | undefined;
  readonly lastCommandRecord: CommandRecord | undefined;
  readonly lastCommandRun: RunRecord | undefined;
  readonly commandPanel: ReactNode | undefined;
  readonly onAction: (action: ApprovalAction, note?: string) => void;
}

export function ControlConsoleMainPanel({
  selected,
  lastCommand,
  lastCommandRecord,
  lastCommandRun,
  commandPanel,
  onAction,
}: ControlConsoleMainPanelProps) {
  return (
    <main
      style={{
        display: 'grid',
        gap: '12px',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#212121' }}>Web 控制台</h1>
      {commandPanel}
      {lastCommand === undefined ? null : (
        <CommandReceiptPanel result={lastCommand} command={lastCommandRecord} run={lastCommandRun} />
      )}
      {selected === undefined ? (
        <p style={{ color: '#9e9e9e', fontSize: '14px' }}>暂无可审批工件。</p>
      ) : (
        <>
          <ArtifactDetail artifact={selected} onAction={onAction} pending={selected.proposalStatus === 'commit-blocked' || selected.proposalStatus === 'waiting-sync'} />
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
  );
}
