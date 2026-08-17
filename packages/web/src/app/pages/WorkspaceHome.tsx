/* eslint-disable complexity */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import { useCreateBootstrapSessionMutation, useGetBootstrapConfigQuery, useListBootstrapSessionsQuery } from '../../control-api';

export function WorkspaceHome() {
  const { data: sessions = [] } = useListBootstrapSessionsQuery();
  const { data: config } = useGetBootstrapConfigQuery();
  const [createBootstrapSession, { isLoading: isCreating }] = useCreateBootstrapSessionMutation();
  const [selectedPath, setSelectedPath] = useState<'new-book' | 'import'>();
  const [bookName, setBookName] = useState('');
  const [sourceRoot, setSourceRoot] = useState('');
  const [message, setMessage] = useState<string>();
  const navigate = useNavigate();

  const startSession = async (): Promise<void> => {
    if (selectedPath === undefined || config === undefined) {
      return;
    }
    if (selectedPath === 'import' && sourceRoot.trim().length === 0) {
      setMessage('请填写要导入的作品目录。');
      return;
    }
    const { result, sessionId } = await createBootstrapSession({
      path: selectedPath,
      ...(bookName.trim().length === 0 ? {} : { bookName: bookName.trim() }),
      config,
    }).unwrap();
    if (result.status !== 'accepted') {
      setMessage(result.message);
      return;
    }
    const sourceQuery = selectedPath === 'import' ? `?sourceRoot=${encodeURIComponent(sourceRoot.trim())}` : '';
    navigate(`/bootstrap/${encodeURIComponent(sessionId)}${sourceQuery}`);
  };

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px', display: 'grid', gap: '24px' }}>
      <header>
        <p style={{ color: '#607d8b', margin: 0 }}>Novel Enginner</p>
        <h1 style={{ margin: '4px 0' }}>工作区</h1>
        <p style={{ color: '#546e7a' }}>开始创作或把已有作品接入当前工作区。</p>
      </header>
      <section style={{ border: '1px solid #cfd8dc', padding: '16px', display: 'grid', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>当前工作区</h2>
        <p style={{ margin: 0 }}>已连接到配置中的作品和工作目录。创建会话时会自动使用它们。</p>
        <p style={{ margin: 0, color: '#546e7a' }}>工作目录：{config?.workspaceRoot ?? '正在读取配置…'}</p>
      </section>
      <section style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { setSelectedPath('new-book'); setMessage(undefined); }}>新建作品</button>
        <button type="button" onClick={() => { setSelectedPath('import'); setMessage(undefined); }}>导入已有作品</button>
        <Link to="/app" style={{ color: '#1565c0' }}>书籍控制台</Link>
      </section>
      {selectedPath === undefined ? null : (
        <section style={{ border: '1px solid #cfd8dc', padding: '16px', display: 'grid', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>{selectedPath === 'new-book' ? '新建作品向导' : '导入作品向导'}</h2>
          <p style={{ margin: 0 }}>
            {selectedPath === 'new-book'
              ? '先给作品取一个名字，然后按阶段补充灵感、设定和大纲。每一步都可以保存后继续。'
              : '先提供已有作品所在的目录，系统会先扫描并展示导入预览，确认后才会写入当前工作区。'}
          </p>
          {selectedPath === 'new-book' ? (
            <label>
              作品名称（可稍后补充）
              <input aria-label="作品名称" value={bookName} onChange={(event) => setBookName(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '4px' }} />
            </label>
          ) : (
            <label>
              已有作品目录
              <input aria-label="已有作品目录" value={sourceRoot} onChange={(event) => setSourceRoot(event.target.value)} placeholder="例如：/Users/me/Documents/my-novel" style={{ display: 'block', width: '100%', marginTop: '4px' }} />
            </label>
          )}
          <button type="button" onClick={() => { void startSession(); }} disabled={config === undefined || isCreating}>
            {selectedPath === 'new-book' ? '开始新建' : '开始导入'}
          </button>
          {message === undefined ? null : <p role="status" style={{ margin: 0 }}>{message}</p>}
        </section>
      )}
      <section>
        <h2 style={{ fontSize: '18px' }}>可恢复的初始化会话</h2>
        {sessions.length === 0 ? <p>暂无可恢复会话。</p> : <SessionList sessions={sessions} />}
      </section>
    </main>
  );
}

function SessionList({ sessions }: { readonly sessions: readonly BootstrapSession[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
      {sessions.map((session) => (
        <li key={session.id} style={{ border: '1px solid #cfd8dc', padding: '12px' }}>
          <Link to={`/bootstrap/${encodeURIComponent(session.id)}`} style={{ color: '#1565c0' }}>
            {session.bookName ?? session.id}
          </Link>
          <small style={{ display: 'block', color: '#546e7a' }}>{session.currentStage} · {session.status}</small>
        </li>
      ))}
    </ul>
  );
}