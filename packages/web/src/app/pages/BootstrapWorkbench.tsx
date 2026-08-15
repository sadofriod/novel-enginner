/* eslint-disable complexity */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import { ApiClient } from '../../api-client';

const apiClient = new ApiClient({ baseUrl: '/api' });

export function BootstrapWorkbench() {
  const { sessionId } = useParams();
  const [session, setSession] = useState<BootstrapSession>();
  const [revisions, setRevisions] = useState<readonly BootstrapRevision[]>([]);
  const [evidence, setEvidence] = useState<readonly BootstrapEvidence[]>([]);
  const [summary, setSummary] = useState('');
  const [mapping, setMapping] = useState('{\n  "entries": []\n}');
  const [sourceRoot, setSourceRoot] = useState('');
  const [targetRoot, setTargetRoot] = useState('');
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (sessionId === undefined || sessionId === 'new-book' || sessionId === 'import') {
      return;
    }
    void Promise.all([
      apiClient.getBootstrapSession(sessionId),
      apiClient.listBootstrapRevisions(sessionId),
      apiClient.listBootstrapEvidence(sessionId),
    ]).then(([nextSession, nextRevisions, nextEvidence]) => {
      setSession(nextSession);
      setRevisions(nextRevisions);
      setEvidence(nextEvidence);
    });
  }, [sessionId]);

  if (sessionId === 'new-book' || sessionId === 'import') {
    return <main style={{ padding: '32px' }}><h1>{sessionId === 'new-book' ? '新建作品' : '导入作品'}</h1><p>初始化会话将在提交第一项工作区信息后创建。</p><Link to="/">返回工作区</Link></main>;
  }
  if (session === undefined) {
    return <main style={{ padding: '32px' }}><h1>Bootstrap 工作台</h1><p>正在读取会话，或会话不存在。</p><Link to="/">返回工作区</Link></main>;
  }
  const refreshSession = async (): Promise<void> => {
    if (sessionId === undefined) {
      return;
    }
    const [nextSession, nextRevisions, nextEvidence] = await Promise.all([
      apiClient.getBootstrapSession(sessionId),
      apiClient.listBootstrapRevisions(sessionId),
      apiClient.listBootstrapEvidence(sessionId),
    ]);
    setSession(nextSession);
    setRevisions(nextRevisions);
    setEvidence(nextEvidence);
  };

  const submitSessionCommand = (intent: 'submit-dialogue-round' | 'submit-market-research' | 'scan-import-directory' | 'confirm-import' | 'continue-bootstrap-session' | 'discard-bootstrap-session'): void => {
    if (session === undefined) {
      return;
    }
    let parsedMapping: Record<string, unknown> | undefined;
    if (intent === 'scan-import-directory' || intent === 'confirm-import') {
      try {
        const parsed = JSON.parse(mapping);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setMessage('映射预览必须是 JSON 对象。');
          return;
        }
        parsedMapping = parsed as Record<string, unknown>;
      } catch {
        setMessage('映射预览不是有效 JSON。');
        return;
      }
    }
    if ((intent === 'submit-dialogue-round' || intent === 'submit-market-research') && summary.trim().length === 0) {
      setMessage('请先填写本阶段记录。');
      return;
    }
    void apiClient.submitCommand({
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
      ...(intent !== 'confirm-import' ? {} : { sourceRoot, targetRoot }),
    }).then(async (result) => {
      if (result.status !== 'accepted') {
        setMessage(result.message);
        return;
      }
      setSummary('');
      setMessage('已保存。');
      await refreshSession();
    });
  };

  const submitRound = (): void => {
    if (summary.trim().length === 0) {
      return;
    }
    submitSessionCommand(session.currentStage === 'market-research' ? 'submit-market-research' : 'submit-dialogue-round');
  };
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px', display: 'grid', gap: '20px' }}>
      <Link to="/" style={{ color: '#1565c0' }}>返回工作区</Link>
      <header><h1>{session.bookName ?? 'Bootstrap 工作台'}</h1><p>{session.currentStage} · {session.status}</p></header>
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
          <h2>导入映射预览</h2>
          <textarea aria-label="导入映射 JSON" value={mapping} onChange={(event) => setMapping(event.target.value)} style={{ display: 'block', width: '100%', minHeight: '120px' }} />
          <button type="button" onClick={() => submitSessionCommand('scan-import-directory')} style={{ marginTop: '8px' }}>保存映射预览</button>
        </section>
      ) : null}
      {session.currentStage === 'import-mapping' ? (
        <section>
          <h2>确认导入</h2>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            原始目录
            <input aria-label="原始目录" value={sourceRoot} onChange={(event) => setSourceRoot(event.target.value)} style={{ display: 'block', width: '100%' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Canonical 工作区目录
            <input aria-label="Canonical 工作区目录" value={targetRoot} onChange={(event) => setTargetRoot(event.target.value)} style={{ display: 'block', width: '100%' }} />
          </label>
          <textarea aria-label="确认导入映射 JSON" value={mapping} onChange={(event) => setMapping(event.target.value)} style={{ display: 'block', width: '100%', minHeight: '120px' }} />
          <button type="button" onClick={() => submitSessionCommand('confirm-import')} style={{ marginTop: '8px' }}>确认导入</button>
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