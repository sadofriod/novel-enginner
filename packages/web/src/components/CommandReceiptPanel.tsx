/* eslint-disable complexity */

import type { CommandAcceptedResponse } from '@novel-enginner/services/runtime/command-handler';
import type { CommandRecord, RunRecord } from '@novel-enginner/services/runtime/store';

export interface CommandReceiptPanelProps {
  readonly result: CommandAcceptedResponse;
  readonly command: CommandRecord | undefined;
  readonly run: RunRecord | undefined;
}

export function CommandReceiptPanel({ result, command, run }: CommandReceiptPanelProps) {
  return (
    <section aria-label="命令回执" style={{ border: '1px solid #90caf9', borderRadius: '4px', padding: '12px', background: '#f8fbff', display: 'grid', gap: '6px' }}>
      <h2 style={{ margin: 0, fontSize: '14px', color: '#1565c0' }}>命令回执</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', margin: 0, fontSize: '12px' }}>
        <dt>commandId</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{command?.commandId ?? result.commandId}</dd>
        <dt>runId</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{run?.runId ?? result.runId}</dd>
        <dt>状态</dt>
        <dd style={{ margin: 0 }}>{run?.status ?? command?.status ?? result.status}</dd>
        <dt>下一状态</dt>
        <dd style={{ margin: 0 }}>{run?.nextExpectedState ?? result.nextExpectedState}</dd>
      </dl>
    </section>
  );
}