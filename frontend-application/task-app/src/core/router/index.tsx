import { createBrowserRouter, type RouteObject } from 'react-router';

import { TaskTypesGate } from '../../features/tasks/components/TaskTypesGate';
import { ConnectView } from '../../features/tasks/views/ConnectView';
import { MyTasksView } from '../../features/tasks/views/MyTasksView';
import { TaskDetailView } from '../../features/tasks/views/TaskDetailView';
import { AppLayout } from '../../layouts/AppLayout';
import { LegacyTaskRedirect } from './LegacyTaskRedirect';

/**
 * `AppLayout` (header + global `ToastHost`/`ModalHost`) wraps every route;
 * `TaskTypesGate` sits inside it: task-type metadata is app-critical, so
 * nothing below it renders until that load resolves.
 *
 * Every screen gets its own address: `/` is the gate (`ConnectView`), and
 * `/users/:userId` is that user's task list — the id in the path is the one
 * place "whose list is this" lives, so the URL alone survives a reload.
 * `MyTasksView` in turn wraps the detail route the same way it always has:
 * the task table stays mounted behind whatever `tasks/:taskId` renders
 * instead of being replaced by it, while the URL itself stays a real,
 * deep-linkable route, now nested under the user it belongs to.
 *
 * `tasks/:taskId` at the root is the pre-`/users/:userId` shape; it has no
 * user in the path to route on, so it only ever resolves the task's assignee
 * and redirects into the current shape.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <TaskTypesGate>
        <AppLayout />
      </TaskTypesGate>
    ),
    children: [
      { index: true, element: <ConnectView /> },
      {
        path: 'users/:userId',
        element: <MyTasksView />,
        children: [
          // A pathless layout route only matches when one of its children
          // does, so the list needs an index child of its own to render at
          // `/users/:userId`; it contributes nothing to the outlet, the list
          // is the whole screen until a task is opened.
          { index: true, element: <></> },
          { path: 'tasks/:taskId', element: <TaskDetailView /> },
        ],
      },
      { path: 'tasks/:taskId', element: <LegacyTaskRedirect /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
