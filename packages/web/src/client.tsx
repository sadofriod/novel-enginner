import { createRoot } from 'react-dom/client';

import { ApiClient } from './api-client';
import { ControlConsole } from './ControlConsole';

const rootElement = document.getElementById('web-app-root');

if (rootElement !== null) {
  createRoot(rootElement).render(<ControlConsole apiClient={new ApiClient()} />);
}