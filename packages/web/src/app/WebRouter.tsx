import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { BootstrapWorkbench } from './pages/BootstrapWorkbench';
import { WorkspaceHome } from './pages/WorkspaceHome';
import { WorkspaceWorkbench } from './pages/workspace-workbench';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceHome /> },
  { path: '/bootstrap/:sessionId', element: <BootstrapWorkbench /> },
  { path: '/workspace', element: <WorkspaceWorkbench /> },
]);

export function WebRouter() {
  return <RouterProvider router={router} />;
}