import { createBrowserRouter } from 'react-router';

import { App } from '../../App';
import { TaskTypesGate } from '../../features/tasks/components/TaskTypesGate';
import { TaskDetailView } from '../../features/tasks/views/TaskDetailView';
import { AppLayout } from '../../layouts/AppLayout';

/**
 * `AppLayout` (header + global `ToastHost`/`ModalHost`) wraps every route;
 * `TaskTypesGate` sits inside it: task-type metadata is app-critical, so
 * nothing below it renders until that load resolves.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <TaskTypesGate>
        <AppLayout />
      </TaskTypesGate>
    ),
    children: [
      { index: true, element: <App /> },
      { path: 'tasks/:taskId', element: <TaskDetailView /> },
    ],
  },
]);
