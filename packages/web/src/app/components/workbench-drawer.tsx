/* eslint-disable complexity */
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, Typography } from '@mui/material';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';
import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

import type { RootState } from '../../store';
import { ApprovalQueue, artifactKey, isActionableProposal } from '../../components/ApprovalQueue';
import { RunTracePanel } from '../../components/RunTracePanel';
import { InteractiveDerivedGraph } from './InteractiveDerivedGraph';
import { CapabilityRegistryView } from './capability-registry-view';
import { toDerivedGraphView } from './graph-adapter';
import { ARTIFACT_FORM_SPECS } from '../../proposal-forms/artifact-form-specs';
import { ArtifactAuthoringForm } from '../../proposal-forms/ArtifactAuthoringForm';
import { buildAuthorProposeInput } from '../../proposal-forms/propose-command';
import {
  useGetBootstrapConfigQuery,
  useGetWorkspaceGraphQuery,
  useListArtifactsQuery,
  useListRunsQuery,
  useSubmitCommandMutation,
} from '../../control-api';

import type { BootstrapConfig, CommandInput, WorkspaceGraph } from '../../api-types';
import type { ApprovalAction } from '../../components/ArtifactDetail';

export type WorkbenchDrawerTab = 'approval' | 'runs' | 'graph' | 'capabilities' | 'propose';

const TABS: readonly { readonly id: WorkbenchDrawerTab; readonly label: string }[] = [
  { id: 'approval', label: '审批' },
  { id: 'runs', label: '运行' },
  { id: 'graph', label: '图谱' },
  { id: 'capabilities', label: '能力' },
  { id: 'propose', label: '新建' },
];

export function WorkbenchDrawer({
  tab,
  onTabChange,
}: {
  readonly tab: WorkbenchDrawerTab;
  readonly onTabChange: (tab: WorkbenchDrawerTab) => void;
}) {
  const { data: artifacts = [] } = useListArtifactsQuery();
  const { data: runs = [] } = useListRunsQuery();
  const { data: graph } = useGetWorkspaceGraphQuery();
  const { data: config } = useGetBootstrapConfigQuery();
  const [submitCommand] = useSubmitCommandMutation();
  const runCommand = async (input: CommandInput): Promise<CommandResult> => {
    try {
      return await submitCommand(input).unwrap();
    } catch (error) {
      // A rejected command (e.g. workspace-invalid, invalid intent) surfaces as a
      // CommandResult on the error payload; fall back to a readable message so
      // callers can render feedback instead of swallowing an unhandled rejection.
      const data = (error as { data?: CommandResult })?.data;
      return data ?? { status: 'rejected', code: 'command-failed', message: error instanceof Error ? error.message : String(error) };
    }
  };

  return (
    <Paper
      component="aside"
      aria-label="工作台工具"
      variant="outlined"
      sx={{ p: 1.5, display: 'grid', gap: 1.5, alignSelf: 'start', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
    >
      <Tabs value={tab} onChange={(_event, value: WorkbenchDrawerTab) => onTabChange(value)} variant="scrollable" scrollButtons="auto">
        {TABS.map((item) => (
          <Tab key={item.id} value={item.id} label={item.label} />
        ))}
      </Tabs>
      {tab === 'approval' && <ApprovalTab artifacts={artifacts} config={config} runCommand={runCommand} />}
      {tab === 'runs' && <RunTracePanel runs={runs} />}
      {tab === 'graph' && <GraphTab graph={graph} />}
      {tab === 'capabilities' && <CapabilityRegistryView />}
      {tab === 'propose' && <ProposeTab config={config} runCommand={runCommand} />}
    </Paper>
  );
}

function ApprovalTab({
  artifacts,
  config,
  runCommand,
}: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly config: BootstrapConfig | undefined;
  readonly runCommand: (input: CommandInput) => Promise<CommandResult>;
}) {
  const [selected, setSelected] = useState<ArtifactSummary>();
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ readonly kind: 'success' | 'error'; readonly message: string }>();
  const [lastRunId, setLastRunId] = useState<string>();
  const latestFailure = useSelector((state: RootState) => state.decisionFeedback.latest);

  const actionableKeys = new Set(
    artifacts.filter(isActionableProposal).map((artifact) => artifactKey(artifact.artifactType, artifact.targetId)),
  );
  // Once the selected item leaves the actionable queue (approved / rejected / removed),
  // clear the detail panel and any stale feedback so it does not linger after the fact.
  useEffect(() => {
    if (selected !== undefined && !actionableKeys.has(artifactKey(selected.artifactType, selected.targetId))) {
      setSelected(undefined);
      setFeedback(undefined);
      setLastRunId(undefined);
    }
  }, [actionableKeys, selected]);

  const handleAction = async (action: ApprovalAction): Promise<void> => {
    if (running) {
      return;
    }
    if (selected === undefined || config === undefined) {
      setFeedback({ kind: 'error', message: '未选择待审批项，或工作区配置缺失。' });
      return;
    }
    setRunning(true);
    setFeedback(undefined);
    setLastRunId(undefined);
    try {
      const result = await runCommand({
        workspaceId: config.workspaceId,
        bookId: config.bookId,
        artifactType: selected.artifactType,
        targetId: selected.targetId,
        intent: action,
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: `web-${action}-${selected.targetId}-${Date.now().toString(36)}`,
      });
      if (result.status === 'accepted') {
        setLastRunId(result.runId);
        // The command is accepted asynchronously; the real decision outcome (commit
        // vs review-rejected / workspace-invalid) arrives as a run.step.failed event
        // or a queue refresh, surfaced below instead of a silent no-op.
        setFeedback({ kind: 'success', message: `${action} 已提交（run ${result.runId}），等待执行结果…` });
      } else {
        setFeedback({ kind: 'error', message: result.message ?? `命令被拒绝（${result.code}）。` });
      }
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setRunning(false);
    }
  };

  const decisionFailure = lastRunId !== undefined && latestFailure?.runId === lastRunId ? latestFailure : undefined;
  const shownFeedback = decisionFailure === undefined
    ? feedback
    : { kind: 'error' as const, message: `执行失败：${decisionFailure.reason}` };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <ApprovalQueue
        artifacts={artifacts}
        {...(selected === undefined ? {} : { selectedKey: artifactKey(selected.artifactType, selected.targetId) })}
        onSelect={setSelected}
      />
      {selected === undefined ? null : (
        <Paper variant="outlined" sx={{ p: 1.25, display: 'grid', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selected.artifactType} :: {selected.targetId}
          </Typography>
          {isActionableProposal(selected) ? (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {(['approve', 'reject', 'override-approve', 'export-draft'] as const).map((action) => (
                <Button
                  key={action}
                  size="small"
                  variant="outlined"
                  disabled={running}
                  onClick={() => void handleAction(action)}
                >
                  {action}
                </Button>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              该工件当前没有待处理的 proposal。
            </Typography>
          )}
          {shownFeedback === undefined ? null : (
            <Alert severity={shownFeedback.kind} sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
              {shownFeedback.message}
            </Alert>
          )}
        </Paper>
      )}
    </Box>
  );
}

function GraphTab({ graph }: { readonly graph: WorkspaceGraph | undefined }) {
  if (graph === undefined) {
    return <Typography variant="body2" color="text.secondary">加载图谱…</Typography>;
  }
  if (graph.status === 'not-ready' || graph.nodes.length === 0) {
    return <Typography variant="body2" color="text.secondary">图谱尚未生成，请先「同步工作区」。</Typography>;
  }
  return <InteractiveDerivedGraph graph={toDerivedGraphView(graph)} />;
}

function ProposeTab({
  config,
  runCommand,
}: {
  readonly config: BootstrapConfig | undefined;
  readonly runCommand: (input: CommandInput) => Promise<CommandResult>;
}) {
  const [artifactType, setArtifactType] = useState<ProposalArtifactType>('chapter-outline');
  const [message, setMessage] = useState<string>();

  const handleSubmit = async (payload: Record<string, unknown>): Promise<{ readonly ok: boolean; readonly message: string }> => {
    const result = await runCommand(buildAuthorProposeInput(config, artifactType, payload));
    if (result.status === 'accepted') {
      setMessage('✔ Proposal 已生成，等待审批。');
      return { ok: true, message: '' };
    }
    setMessage(result.message);
    return { ok: false, message: result.message };
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <FormControl size="small" fullWidth>
        <InputLabel id="artifact-type-label">工件类型</InputLabel>
        <Select
          labelId="artifact-type-label"
          label="工件类型"
          value={artifactType}
          onChange={(event) => setArtifactType(event.target.value as ProposalArtifactType)}
        >
          {Object.keys(ARTIFACT_FORM_SPECS).map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <ArtifactAuthoringForm key={artifactType} spec={ARTIFACT_FORM_SPECS[artifactType]} onSubmit={handleSubmit} />
      {message === undefined ? null : (
        <Typography variant="body2" role="status" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
}
