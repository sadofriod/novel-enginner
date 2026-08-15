import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ApiClient } from '../api-client';
import { ControlConsole } from '../ControlConsole';
import { BootstrapWorkbench } from './pages/BootstrapWorkbench';
import { WorkspaceHome } from './pages/WorkspaceHome';

const apiClient = new ApiClient({ baseUrl: '/api' });

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceHome /> },
  { path: '/bootstrap/:sessionId', element: <BootstrapWorkbench /> },
  { path: '/app', element: <ControlConsole apiClient={apiClient} /> },
]);

export function WebRouter() {
  return <RouterProvider router={router} />;
}