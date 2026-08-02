import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserStoreState } from '../../features/tasks/stores/useCurrentUserStore';
import { useCurrentUserStore } from '../../features/tasks/stores/useCurrentUserStore';
import { useTaskStore } from '../../features/tasks/stores/useTaskStore';
import type { TaskStoreState } from '../../features/tasks/stores/useTaskStore';
import type { TaskTypeStoreState } from '../../features/tasks/stores/useTaskTypeStore';
import { useTaskTypeStore } from '../../features/tasks/stores/useTaskTypeStore';
import type { Task } from '../../features/tasks/types';
import { routes } from './index';

vi.mock('../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../../shared/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('../../shared/components/Toast', () => ({
  ToastHost: () => <div data-testid="toast-host" />,
}));

vi.mock('../../shared/components/Modal', () => ({
  ModalHost: () => <div data-testid="modal-host" />,
}));

vi.mock('../modals/modalRegistry', () => ({ MODAL_REGISTRY: {} }));

vi.mock('../../features/tasks/components/TaskTypesGate', () => ({
  TaskTypesGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../features/tasks/views/ConnectView', () => ({
  ConnectView: () => <div data-testid="connect-view">gate screen</div>,
}));

vi.mock('../../features/tasks/views/MyTasksView', async () => {
  const { Outlet } = await import('react-router');
  return {
    MyTasksView: () => {
      const { userId } = useParams<{ userId: string }>();
      return (
        <div data-testid="my-tasks-view">
          list for {userId}
          <Outlet />
        </div>
      );
    },
  };
});

vi.mock('../../features/tasks/views/TaskDetailView', () => ({
  TaskDetailView: () => {
    const { taskId } = useParams<{ taskId: string }>();
    return <div data-testid="task-detail-view">drawer for {taskId}</div>;
  },
}));

// The drawer-close regression test below needs `TaskDetailView`'s real
// `closeDrawer` navigation, not this stub — it opts back into the real
// module via `vi.importActual`. Its own dependencies stay mocked exactly
// like every other test here.
vi.mock('../../features/tasks/hooks/useTaskRealtime', () => ({ useTaskRealtime: vi.fn() }));
vi.mock('../../features/tasks/stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));
vi.mock('../../features/tasks/stores/useCurrentUserStore', () => ({
  useCurrentUserStore: vi.fn(),
}));
vi.mock('../../features/tasks/stores/useTaskTypeStore', () => ({ useTaskTypeStore: vi.fn() }));

const mockedUseTaskStore = vi.mocked(useTaskStore);
const mockedUseCurrentUserStore = vi.mocked(useCurrentUserStore);
const mockedUseTaskTypeStore = vi.mocked(useTaskTypeStore);

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-9',
    type: 'development',
    status: 1,
    statusName: 'open',
    isClosed: false,
    assignedUserId: 'u-7',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockTaskStore(overrides: Partial<TaskStoreState> = {}): void {
  const state: TaskStoreState = {
    items: [],
    nextCursor: null,
    currentTask: null,
    listUserId: null,
    isLoading: false,
    error: null,
    historyItems: [],
    historyNextCursor: null,
    fetchTasksForUser: vi.fn(),
    fetchTask: vi.fn().mockResolvedValue(true),
    fetchTaskHistory: vi.fn(),
    createTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    closeTask: vi.fn(),
    applyTaskEvent: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };

  mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
    selector(state),
  );
}

function mockCurrentUserStore(): void {
  const state: CurrentUserStoreState = {
    users: [],
    isLoading: false,
    error: null,
    fetchUsers: vi.fn(),
    reset: vi.fn(),
  };

  mockedUseCurrentUserStore.mockImplementation(
    (selector: (state: CurrentUserStoreState) => unknown) => selector(state),
  );
}

function mockTaskTypeStore(): void {
  const state: TaskTypeStoreState = {
    status: 'ready',
    definitions: [],
    error: null,
    loadTaskTypes: vi.fn(),
  };

  mockedUseTaskTypeStore.mockImplementation((selector: (state: TaskTypeStoreState) => unknown) =>
    selector(state),
  );
}

function renderAt(initialPath: string): ReturnType<typeof render> {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(<RouterProvider router={router} />);
}

/**
 * Mirrors the app's real route nesting (`/`, `/users/:userId`, nested
 * `tasks/:taskId`) but with stand-ins for the gate and the list — this is
 * the one test that needs `TaskDetailView`'s real close navigation instead
 * of the stub every other case in this file uses.
 */
async function renderRealTaskDetailRoute(initialPath: string): Promise<ReturnType<typeof render>> {
  const { TaskDetailView: RealTaskDetailView } = await vi.importActual<
    typeof import('../../features/tasks/views/TaskDetailView')
  >('../../features/tasks/views/TaskDetailView');

  const router = createMemoryRouter(
    [
      { path: '/', element: <div data-testid="connect-view">gate screen</div> },
      {
        path: '/users/:userId',
        element: (
          <div data-testid="my-tasks-view">
            list screen
            <Outlet />
          </div>
        ),
        children: [{ path: 'tasks/:taskId', element: <RealTaskDetailView /> }],
      },
    ],
    { initialEntries: [initialPath] },
  );

  return render(<RouterProvider router={router} />);
}

describe('router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskStore({ currentTask: buildTask() });
  });

  describe('Given:the root address', () => {
    it('should render the gate', () => {
      renderAt('/');

      expect(screen.getByTestId('connect-view')).toBeInTheDocument();
    });
  });

  describe('Given:a user’s scoped list address', () => {
    it('should render that user’s task list', () => {
      renderAt('/users/u-1');

      expect(screen.getByTestId('my-tasks-view')).toHaveTextContent('list for u-1');
      expect(screen.queryByTestId('task-detail-view')).not.toBeInTheDocument();
    });
  });

  describe('Given:a deep link to a task inside a user’s list', () => {
    it('should render the drawer over the still-mounted list', () => {
      renderAt('/users/u-1/tasks/t-1');

      expect(screen.getByTestId('my-tasks-view')).toHaveTextContent('list for u-1');
      expect(screen.getByTestId('task-detail-view')).toHaveTextContent('drawer for t-1');
    });
  });

  describe('Given:a legacy task address with no user in the path', () => {
    it('should resolve the task’s assignee and redirect into the new shape', async () => {
      renderAt('/tasks/t-9');

      expect(await screen.findByTestId('my-tasks-view')).toHaveTextContent('list for u-7');
      expect(screen.getByTestId('task-detail-view')).toHaveTextContent('drawer for t-9');
    });
  });

  describe('Given:the wordmark is clicked from a nested screen', () => {
    it('should navigate back to the root gate', () => {
      renderAt('/users/u-1');

      fireEvent.click(screen.getByRole('link', { name: 'app-layout.title' }));

      expect(screen.getByTestId('connect-view')).toBeInTheDocument();
    });
  });

  describe('Given:the drawer is open at a user’s scoped task address', () => {
    beforeEach(() => {
      mockTaskStore({ currentTask: buildTask({ id: 't-1', assignedUserId: 'u-1' }) });
      mockCurrentUserStore();
      mockTaskTypeStore();
    });

    it('should close via its close button onto that user’s list, not the root gate', async () => {
      await renderRealTaskDetailRoute('/users/u-1/tasks/t-1');

      fireEvent.click(screen.getByRole('button', { name: 'drawer.close-button-label' }));

      expect(await screen.findByTestId('my-tasks-view')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('connect-view')).not.toBeInTheDocument();
    });

    it('should close via Escape onto that user’s list, not the root gate', async () => {
      await renderRealTaskDetailRoute('/users/u-1/tasks/t-1');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(await screen.findByTestId('my-tasks-view')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('connect-view')).not.toBeInTheDocument();
    });
  });
});
