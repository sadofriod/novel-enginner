import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import { ApiClient } from '../../api-client';

const apiClient = new ApiClient({ baseUrl: '/api' });

export function WorkspaceHome() {
  const [sessions, setSessions] = useState<readonly BootstrapSession[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    void apiClient.listBootstrapSessions().then(setSessions);
  }, []);

  const startSession = (path: 'new-book' | 'import'): void => {
    void apiClient.createBootstrapSession(path).then(({ result, sessionId }) => {
      if (result.status !== 'accepted') {
        return;
      }
      navigate(`/bootstrap/${encodeURIComponent(sessionId)}`);
    });
  };
  const recoverableSession = sessions.find((session) => !['completed', 'abandoned', 'failed'].includes(session.status));
  const hasReadyBook = sessions.some((session) => session.status === 'ready-to-write');

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px', display: 'grid', gap: '24px' }}>
      <header>
        <p style={{ color: '#607d8b', margin: 0 }}>Novel Enginner</p>
        <h1 style={{ margin: '4px 0' }}>工作区</h1>
      </header>
      <section style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={() => startSession('new-book')}>新建作品</button>
        <button type="button" onClick={() => startSession('import')}>导入作品</button>
        <button
          type="button"
          onClick={() => recoverableSession === undefined ? undefined : navigate(`/bootstrap/${encodeURIComponent(recoverableSession.id)}`)}
          disabled={recoverableSession === undefined}
        >
          继续创建
        </button>
        {hasReadyBook ? <Link to="/app" style={{ color: '#1565c0' }}>书籍控制台</Link> : null}
      </section>
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