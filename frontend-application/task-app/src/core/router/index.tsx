import { createBrowserRouter } from 'react-router';

import { TaskTypesGate } from '../../features/tasks/components/TaskTypesGate';
import { MyTasksView } from '../../features/tasks/views/MyTasksView';
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
    children: [{ index: true, element: <MyTasksView /> }],
  },
]);
