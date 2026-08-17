import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { ApiClient } from '../api-client';
import { CommandOperationsPanel } from './CommandOperationsPanel';

describe('CommandOperationsPanel', () => {
  test('renders entries for every CLI-only command category', () => {
    const html = renderToStaticMarkup(
      <CommandOperationsPanel
        apiClient={new ApiClient()}
        workspaceId="workspace-1"
        bookId="book-1"
        onCommandCompleted={async () => undefined}
      />,
    );

    expect(html).toContain('同步工作区');
    expect(html).toContain('重建剧情图谱');
    expect(html).toContain('生成提案');
    expect(html).toContain('重新生成提案');
    expect(html).toContain('恢复运行');
    expect(html).toContain('重试步骤');
    expect(html).toContain('中止运行');
    expect(html).toContain('章节细纲');
  });
});