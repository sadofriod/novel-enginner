import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ControlConsoleContainer } from './ControlConsoleContainer';
import { ArtifactAuthoringPage } from './pages/ArtifactAuthoringPage';
import { BootstrapWorkbench } from './pages/BootstrapWorkbench';
import { WorkspaceHome } from './pages/WorkspaceHome';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceHome /> },
  { path: '/bootstrap/:sessionId', element: <BootstrapWorkbench /> },
  { path: '/app', element: <ControlConsoleContainer /> },
  { path: '/app/new/:artifactType', element: <ArtifactAuthoringPage /> },
]);

export function WebRouter() {
  return <RouterProvider router={router} />;
}