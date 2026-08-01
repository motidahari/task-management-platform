import { createBrowserRouter } from 'react-router';

import { TaskTypesGate } from '../../features/tasks/components/TaskTypesGate';
import { MyTasksView } from '../../features/tasks/views/MyTasksView';
import { TaskDetailView } from '../../features/tasks/views/TaskDetailView';
import { AppLayout } from '../../layouts/AppLayout';

/**
 * `AppLayout` (header + global `ToastHost`/`ModalHost`) wraps every route;
 * `TaskTypesGate` sits inside it: task-type metadata is app-critical, so
 * nothing below it renders until that load resolves. `MyTasksView` in turn
 * wraps the detail route: the task table stays mounted behind whatever
 * `tasks/:taskId` renders instead of being replaced by it, while the URL
 * itself stays a real, deep-linkable route.
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
      {
        element: <MyTasksView />,
        children: [
          // A pathless layout route only matches when one of its children
          // does, so the list needs an index child of its own to render at
          // `/`; it contributes nothing to the outlet, the list is the whole
          // screen until a task is opened.
          { index: true, element: <></> },
          { path: 'tasks/:taskId', element: <TaskDetailView /> },
        ],
      },
    ],
  },
]);
