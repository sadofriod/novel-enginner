/* eslint-disable complexity */

import { useState } from 'react';
import { Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';

import { PROPOSAL_ARTIFACT_TYPE_VALUES, type ProposalArtifactType } from '@novel-enginner/services/domain/values';

import type { CommandApi } from '../api-types';
import { getProposalArtifactTypeName } from '../proposal-artifact-type-name';
import { ArtifactProposalForm } from './ArtifactProposalForm';

const AUTHORABLE_ARTIFACT_TYPES = PROPOSAL_ARTIFACT_TYPE_VALUES.filter((type) => type !== 'world-change');

export interface CommandOperationsPanelProps {
  readonly apiClient: CommandApi;
  readonly workspaceId: string | undefined;
  readonly bookId: string | undefined;
  readonly onCommandCompleted: (result: Awaited<ReturnType<CommandApi['submitCommand']>>) => Promise<void>;
}

type CommandKind = 'propose' | 'regenerate';
type RunCommandKind = 'resume-run' | 'retry-step' | 'abort-run';

function isSyncIntent(intent: string): intent is 're-sync-state' | 'rebuild-graph' {
  return intent === 're-sync-state' || intent === 'rebuild-graph';
}

function createIdempotencyKey(intent: string, targetId: string): string {
  return `web-${intent}-${targetId}-${Date.now().toString(36)}`;
}

export function CommandOperationsPanel({
  apiClient,
  workspaceId,
  bookId,
  onCommandCompleted,
}: CommandOperationsPanelProps) {
  const [artifactType, setArtifactType] = useState<ProposalArtifactType>('chapter-outline');
  const [targetId, setTargetId] = useState('');
  const [runId, setRunId] = useState('');
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isReady = workspaceId !== undefined && bookId !== undefined;

  const submit = async (
    intent: CommandKind | RunCommandKind | 're-sync-state' | 'rebuild-graph',
  ): Promise<void> => {
    if (!isReady || isSubmitting) {
      return;
    }
    const resolvedTargetId = intent === 'resume-run' || intent === 'retry-step' || intent === 'abort-run'
      ? runId.trim()
      : targetId.trim();
    const needsTarget = intent !== 're-sync-state' && intent !== 'rebuild-graph';
    if (needsTarget && resolvedTargetId.length === 0) {
      setMessage(intent === 'propose' || intent === 'regenerate' ? '请填写工件目标 ID。' : '请填写运行 ID。');
      return;
    }

    setIsSubmitting(true);
    setMessage(undefined);
    const commonInput = {
      workspaceId: workspaceId as string,
      bookId: bookId as string,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: createIdempotencyKey(intent, resolvedTargetId || 'workspace'),
    } as const;
    const result = isSyncIntent(intent)
      ? await apiClient.submitSync(intent, commonInput)
      : await apiClient.submitCommand({
        ...commonInput,
        ...(intent === 'propose' || intent === 'regenerate' ? { artifactType } : {}),
        ...(needsTarget ? { targetId: resolvedTargetId } : {}),
        intent,
      });
    setMessage(result.status === 'accepted' ? `已提交：${intent}` : result.message);
    setIsSubmitting(false);
    if (result.status === 'accepted') {
      await onCommandCompleted(result);
    }
  };

  return (
    <section
      aria-label="命令操作"
      style={{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: '15px', color: '#212121' }}>命令操作</h2>
        <p style={{ margin: '4px 0 0', color: '#616161', fontSize: '13px' }}>同步工作区、生成提案和控制运行。</p>
      </div>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button type="button" variant="contained" onClick={() => { void submit('re-sync-state'); }} disabled={!isReady || isSubmitting}>同步工作区</Button>
        <Button type="button" variant="outlined" onClick={() => { void submit('rebuild-graph'); }} disabled={!isReady || isSubmitting}>重建剧情图谱</Button>
      </Stack>
      <fieldset style={{ border: '1px solid #e0e0e0', margin: 0, padding: '10px', display: 'grid', gap: '8px' }}>
        <legend>工件提案</legend>
        <FormControl size="small" fullWidth>
          <InputLabel id="artifact-type-label">工件类型</InputLabel>
          <Select labelId="artifact-type-label" aria-label="工件类型" label="工件类型" value={artifactType} onChange={(event) => setArtifactType(event.target.value as ProposalArtifactType)}>
            {PROPOSAL_ARTIFACT_TYPE_VALUES.map((value) => <MenuItem key={value} value={value}>{getProposalArtifactTypeName(value)}</MenuItem>)}
          </Select>
        </FormControl>
        <ArtifactProposalForm artifactType={artifactType} targetId={targetId} onTargetIdChange={setTargetId} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button type="button" variant="contained" onClick={() => { void submit('propose'); }} disabled={!isReady || isSubmitting}>生成提案</Button>
          <Button type="button" variant="outlined" onClick={() => { void submit('regenerate'); }} disabled={!isReady || isSubmitting}>重新生成提案</Button>
        </Stack>
      </fieldset>
      <fieldset style={{ border: '1px solid #e0e0e0', margin: 0, padding: '10px', display: 'grid', gap: '8px' }}>
        <legend>按类型填写新建</legend>
        <p style={{ margin: 0, color: '#616161', fontSize: '13px' }}>每个工件类型使用独立表单填写必需数据，而非复用同一入口。</p>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {AUTHORABLE_ARTIFACT_TYPES.map((type) => (
            <a key={type} href={`/app/new/${type}`} style={{ textDecoration: 'none' }}>
              <Button size="small" variant="outlined">{getProposalArtifactTypeName(type)}</Button>
            </a>
          ))}
        </Stack>
      </fieldset>
      <fieldset style={{ border: '1px solid #e0e0e0', margin: 0, padding: '10px', display: 'grid', gap: '8px' }}>
        <legend>运行控制</legend>
        <TextField size="small" label="运行 ID" aria-label="运行 ID" value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="例如：run-000001" />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button type="button" variant="outlined" onClick={() => { void submit('resume-run'); }} disabled={!isReady || isSubmitting}>恢复运行</Button>
          <Button type="button" variant="outlined" onClick={() => { void submit('retry-step'); }} disabled={!isReady || isSubmitting}>重试步骤</Button>
          <Button type="button" color="error" variant="outlined" onClick={() => { void submit('abort-run'); }} disabled={!isReady || isSubmitting}>中止运行</Button>
        </Stack>
      </fieldset>
      {message === undefined ? null : <p role="status" style={{ margin: 0, fontSize: '13px' }}>{message}</p>}
    </section>
  );
}