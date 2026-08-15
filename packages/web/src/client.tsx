import { createRoot } from 'react-dom/client';

import { WebRouter } from './app/WebRouter';

const rootElement = document.getElementById('web-app-root');

if (rootElement !== null) {
  createRoot(rootElement).render(<WebRouter />);
}