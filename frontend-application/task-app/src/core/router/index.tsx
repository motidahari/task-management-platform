import { createBrowserRouter } from 'react-router-dom';

import { App } from '../../App';

/**
 * Single placeholder route — real feature views (`MyTasksView`,
 * `TaskDetailView`, …) register here as their own tasks land.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
]);
