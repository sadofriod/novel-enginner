/* eslint-disable complexity */

import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  useGetBootstrapConfigQuery,
  useGetBootstrapSessionQuery,
  useListBootstrapEvidenceQuery,
  useListBootstrapRevisionsQuery,
  useSubmitCommandMutation,
} from '../../control-api';

export function BootstrapWorkbench() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const isValidSession = sessionId !== undefined && sessionId !== 'new-book' && sessionId !== 'import';
  const { data: config } = useGetBootstrapConfigQuery(undefined, { skip: !isValidSession });
  const { data: session } = useGetBootstrapSessionQuery(sessionId ?? '', { skip: !isValidSession });
  const { data: revisions = [] } = useListBootstrapRevisionsQuery(sessionId ?? '', { skip: !isValidSession });
  const { data: evidence = [] } = useListBootstrapEvidenceQuery(sessionId ?? '', { skip: !isValidSession });
  const [submitCommand] = useSubmitCommandMutation();
  const [summary, setSummary] = useState('');
  const mapping: Record<string, unknown> = { entries: [] };
  const [sourceRoot, setSourceRoot] = useState(() => searchParams.get('sourceRoot') ?? '');
  const [targetRoot, setTargetRoot] = useState('');
  const [message, setMessage] = useState<string>();

  if (sessionId === 'new-book' || sessionId === 'import') {
    return <main style={{ padding: '32px' }}><h1>{sessionId === 'new-book' ? '新建作品' : '导入作品'}</h1><p>初始化会话将在提交第一项工作区信息后创建。</p><Link to="/">返回工作区</Link></main>;
  }
  if (session === undefined) {
    return <main style={{ padding: '32px' }}><h1>Bootstrap 工作台</h1><p>正在读取会话，或会话不存在。</p><Link to="/">返回工作区</Link></main>;
  }
  const submitSessionCommand = async (intent: 'submit-dialogue-round' | 'submit-market-research' | 'scan-import-directory' | 'confirm-import' | 'continue-bootstrap-session' | 'discard-bootstrap-session'): Promise<void> => {
    if (session === undefined) {
      return;
    }
    let parsedMapping: Record<string, unknown> | undefined;
    if (intent === 'scan-import-directory' || intent === 'confirm-import') {
      if (mapping !== undefined) {
        parsedMapping = mapping;
      }
    }
    if ((intent === 'submit-dialogue-round' || intent === 'submit-market-research') && summary.trim().length === 0) {
      setMessage('请先填写本阶段记录。');
      return;
    }
    const result = await submitCommand({
      workspaceId: session.workspaceId,
      bookId: session.bookId ?? 'book-local',
      systemTaskType: intent,
      intent,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `bootstrap-${intent}-${session.id}-${Date.now().toString(36)}`,
      sessionId: session.id,
      ...(summary.trim().length === 0 ? {} : { summary: summary.trim() }),
      ...(parsedMapping === undefined ? {} : { mapping: parsedMapping }),
      ...(intent !== 'confirm-import' ? {} : { sourceRoot, targetRoot: targetRoot || config?.workspaceRoot || '' }),
    }).unwrap();
    if (result.status !== 'accepted') {
      setMessage(result.message);
      return;
    }
    setSummary('');
    setMessage('已保存。');
  };

  const submitRound = (): void => {
    if (summary.trim().length === 0) {
      return;
    }
    submitSessionCommand(session.currentStage === 'market-research' ? 'submit-market-research' : 'submit-dialogue-round');
  };

  const confirmImport = (): void => {
    if (sourceRoot.trim().length === 0) {
      setMessage('请填写要导入的作品目录。');
      return;
    }
    submitSessionCommand('confirm-import');
  };
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px', display: 'grid', gap: '20px' }}>
      <Link to="/" style={{ color: '#1565c0' }}>返回工作区</Link>
      <header>
        <h1>{session.bookName ?? 'Bootstrap 工作台'}</h1>
        <p>按当前阶段完成下面的任务，保存后再继续。</p>
        <p>当前阶段：{session.currentStage}</p>
      </header>
      <section>
        <h2>阶段修订</h2>
        <p>{revisions.length} 条不可变记录</p>
        <textarea
          aria-label="阶段输入"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          style={{ display: 'block', width: '100%', minHeight: '96px', marginTop: '10px' }}
        />
        <button type="button" onClick={submitRound} style={{ marginTop: '8px' }}>保存本轮</button>
      </section>
      {session.currentStage === 'import-scan' ? (
        <section>
          <h2>扫描作品目录</h2>
          <p>系统会识别作品简介、设定、卷纲和章节，并生成一份待确认的导入预览。</p>
          <button type="button" onClick={() => submitSessionCommand('scan-import-directory')} style={{ marginTop: '8px' }}>开始扫描</button>
        </section>
      ) : null}
      {session.currentStage === 'import-mapping' ? (
        <section>
          <h2>确认导入</h2>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            要导入的作品目录
            <input aria-label="原始目录" value={sourceRoot} onChange={(event) => setSourceRoot(event.target.value)} placeholder="例如：/Users/me/Documents/my-novel" style={{ display: 'block', width: '100%' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            导入到当前工作区
            <input aria-label="Canonical 工作区目录" value={targetRoot || config?.workspaceRoot || ''} onChange={(event) => setTargetRoot(event.target.value)} readOnly style={{ display: 'block', width: '100%' }} />
          </label>
          <button type="button" onClick={confirmImport} style={{ marginTop: '8px' }}>确认导入</button>
        </section>
      ) : null}
      <section style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={() => submitSessionCommand('continue-bootstrap-session')}>继续下一阶段</button>
        <button type="button" onClick={() => submitSessionCommand('discard-bootstrap-session')}>放弃会话</button>
      </section>
      {message === undefined ? null : <p role="status">{message}</p>}
      <section><h2>研究证据</h2><p>{evidence.length} 个来源</p></section>
    </main>
  );
}