import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ControlConsoleContainer } from './ControlConsoleContainer';
import { BootstrapWorkbench } from './pages/BootstrapWorkbench';
import { WorkspaceHome } from './pages/WorkspaceHome';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceHome /> },
  { path: '/bootstrap/:sessionId', element: <BootstrapWorkbench /> },
  { path: '/app', element: <ControlConsoleContainer /> },
]);

export function WebRouter() {
  return <RouterProvider router={router} />;
}