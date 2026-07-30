import { createBrowserRouter } from 'react-router-dom';

import { App } from '../../App';
import { TaskTypesGate } from '../../features/tasks/components/TaskTypesGate';

/**
 * Single placeholder route — real feature views (`MyTasksView`,
 * `TaskDetailView`, …) register here as their own tasks land.
 *
 * `TaskTypesGate` wraps every route: task-type metadata is app-critical, so
 * nothing below it renders until that load resolves.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <TaskTypesGate>
        <App />
      </TaskTypesGate>
    ),
  },
]);
