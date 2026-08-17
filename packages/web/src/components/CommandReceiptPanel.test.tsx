import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { CommandReceiptPanel } from './CommandReceiptPanel';

describe('CommandReceiptPanel', () => {
  test('renders the accepted command and refreshed run snapshot', () => {
    const html = renderToStaticMarkup(
      <CommandReceiptPanel
        result={{ commandId: 'cmd-1', runId: 'run-1', acceptedAt: '2026-08-17T00:00:00.000Z', status: 'accepted', nextExpectedState: 'derived-ready', sseChannel: '/runs/run-1/stream' }}
        command={{ commandId: 'cmd-1', runId: 'run-1', idempotencyKey: 'key-1', status: 'accepted', acceptedAt: '2026-08-17T00:00:00.000Z' }}
        run={{ runId: 'run-1', commandId: 'cmd-1', workspaceId: 'workspace-1', bookId: 'book-1', status: 'running', nextExpectedState: 'derived-ready', createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z' }}
      />,
    );

    expect(html).toContain('命令回执');
    expect(html).toContain('cmd-1');
    expect(html).toContain('run-1');
    expect(html).toContain('derived-ready');
  });
});