import { ErrorCode } from '@core/shared/error-codes';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bus } from '../../../core/bus/bus';
import type { CurrentUserStoreState } from '../stores/useCurrentUserStore';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import type { TaskStoreState } from '../stores/useTaskStore';
import { useTaskStore } from '../stores/useTaskStore';
import type { TaskTypeStoreState } from '../stores/useTaskTypeStore';
import { useTaskTypeStore } from '../stores/useTaskTypeStore';
import type { TaskTypeDefinition, User } from '../types';
import { MyTasksView } from './MyTasksView';

vi.mock('../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

vi.mock('../hooks/useTaskRealtime', () => ({ useTaskRealtime: vi.fn() }));

vi.mock('../stores/useCurrentUserStore', () => ({ useCurrentUserStore: vi.fn() }));
vi.mock('../stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));
vi.mock('../stores/useTaskTypeStore', () => ({ useTaskTypeStore: vi.fn() }));

const mockedUseCurrentUserStore = vi.mocked(useCurrentUserStore);
const mockedUseTaskStore = vi.mocked(useTaskStore);
const mockedUseTaskTypeStore = vi.mocked(useTaskTypeStore);

const users: readonly User[] = [
  { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
  { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
];

const definitions: readonly TaskTypeDefinition[] = [
  { type: 'development', displayName: 'Development', finalStatus: 4, statuses: [] },
];

function mockCurrentUserStore(
  overrides: Partial<CurrentUserStoreState> = {},
): Pick<CurrentUserStoreState, 'fetchUsers' | 'selectUser'> {
  const fetchUsers = vi.fn();
  const selectUser = vi.fn();
  const state: CurrentUserStoreState = {
    users,
    selectedUserId: null,
    isLoading: false,
    error: null,
    fetchUsers,
    selectUser,
    reset: vi.fn(),
    ...overrides,
  };

  mockedUseCurrentUserStore.mockImplementation(
    (selector: (state: CurrentUserStoreState) => unknown) => selector(state),
  );

  return { fetchUsers, selectUser };
}

function mockTaskStore(
  overrides: Partial<TaskStoreState> = {},
): Pick<TaskStoreState, 'fetchTasksForUser'> {
  const fetchTasksForUser = vi.fn().mockResolvedValue(true);
  const state: TaskStoreState = {
    items: [],
    nextCursor: null,
    currentTask: null,
    listUserId: null,
    isLoading: false,
    error: null,
    historyItems: [],
    historyNextCursor: null,
    fetchTasksForUser,
    fetchTask: vi.fn(),
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

  return { fetchTasksForUser };
}

function mockTaskTypeStore(): void {
  const state: TaskTypeStoreState = {
    status: 'ready',
    definitions,
    error: null,
    loadTaskTypes: vi.fn(),
  };

  mockedUseTaskTypeStore.mockImplementation((selector: (state: TaskTypeStoreState) => unknown) =>
    selector(state),
  );
}

function renderMyTasksView(initialPath = '/'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MyTasksView />
    </MemoryRouter>,
  );
}

describe('MyTasksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskTypeStore();
  });

  describe('Given:the view mounts', () => {
    it('should load the user list once', () => {
      const { fetchUsers } = mockCurrentUserStore();
      mockTaskStore();

      renderMyTasksView();

      expect(fetchUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:no user is selected yet', () => {
    it('should render every user as a connect option instead of the toolbar or the task list', () => {
      mockCurrentUserStore({ selectedUserId: null });
      mockTaskStore();

      renderMyTasksView();

      expect(screen.getByTestId('my-tasks-view-user-gate')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByTestId('task-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('my-tasks-view-create-task')).not.toBeInTheDocument();
    });

    it('should select the user whose connect button is clicked', () => {
      const { selectUser } = mockCurrentUserStore({ selectedUserId: null });
      mockTaskStore();

      renderMyTasksView();
      fireEvent.click(screen.getByTestId('my-tasks-view-connect-u-2'));

      expect(selectUser).toHaveBeenCalledWith('u-2');
    });
  });

  describe('Given:no user is selected yet and the user list is loading', () => {
    it('should render skeleton placeholders instead of the connect options', () => {
      mockCurrentUserStore({ selectedUserId: null, isLoading: true });
      mockTaskStore();

      renderMyTasksView();

      expect(screen.getByTestId('my-tasks-view-user-gate')).toBeInTheDocument();
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('my-tasks-view-connect-u-1')).not.toBeInTheDocument();
    });
  });

  describe('Given:no user is selected yet and the user list failed to load', () => {
    it('should render an inline recovery state that re-calls fetchUsers on retry', () => {
      const { fetchUsers } = mockCurrentUserStore({
        selectedUserId: null,
        error: { errorCode: ErrorCode.INTERNAL_ERROR, status: 500, isNetworkError: false },
      });
      mockTaskStore();

      renderMyTasksView();

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('my-tasks-view-gate-retry'));

      // Once from the mount effect, once from the retry click.
      expect(fetchUsers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given:a user is selected', () => {
    it('should fetch the first page of open tasks for that user and render the toolbar and task list', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      const { fetchTasksForUser } = mockTaskStore();

      renderMyTasksView();

      expect(fetchTasksForUser).toHaveBeenCalledWith('u-1', { isClosed: false });
      expect(screen.getByTestId('task-list')).toBeInTheDocument();
      expect(screen.queryByTestId('my-tasks-view-user-gate')).not.toBeInTheDocument();
    });
  });

  describe('Given:a user is selected and the closed filter is toggled', () => {
    it('should refetch the first page with isClosed true', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      const { fetchTasksForUser } = mockTaskStore();

      renderMyTasksView();
      fireEvent.click(screen.getByTestId('my-tasks-view-filter-closed'));

      expect(fetchTasksForUser).toHaveBeenLastCalledWith('u-1', { isClosed: true });
    });
  });

  describe('Given:the create-task button is clicked', () => {
    it('should open the create-task modal via the bus', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      mockTaskStore();
      const modalOpenHandler = vi.fn();
      const unsubscribe = bus.on('modal:open', modalOpenHandler);

      renderMyTasksView();
      fireEvent.click(screen.getByTestId('my-tasks-view-create-task'));

      expect(modalOpenHandler).toHaveBeenCalledWith({ id: 'create-task', props: {} });
      unsubscribe();
    });
  });

  describe('Given:a user is selected and their tasks are assigned to known and unknown users', () => {
    it('should resolve each row’s assignee to a name, falling back to the raw id for an assignee outside the loaded directory', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      mockTaskStore({
        items: [
          {
            id: 't-1',
            type: 'development',
            status: 1,
            statusName: 'created',
            isClosed: false,
            assignedUserId: 'u-1',
            customFields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 't-2',
            type: 'development',
            status: 1,
            statusName: 'created',
            isClosed: false,
            assignedUserId: 'u-unknown',
            customFields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      renderMyTasksView();

      const taskList = screen.getByTestId('task-list');
      expect(within(taskList).getByText('Alice')).toBeInTheDocument();
      expect(within(taskList).getByText('u-unknown')).toBeInTheDocument();
    });

    it('should resolve each row’s type to the loaded type metadata’s display name', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      mockTaskStore({
        items: [
          {
            id: 't-1',
            type: 'development',
            status: 1,
            statusName: 'created',
            isClosed: false,
            assignedUserId: 'u-1',
            customFields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      renderMyTasksView();

      expect(screen.getByText('Development')).toBeInTheDocument();
    });
  });

  describe('Given:a user is selected and the current URL is the detail route for one of their tasks', () => {
    it('should highlight that row in the task table', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      mockTaskStore({
        items: [
          {
            id: 't-1',
            type: 'development',
            status: 1,
            statusName: 'created',
            isClosed: false,
            assignedUserId: 'u-1',
            customFields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      renderMyTasksView('/tasks/t-1');

      const row = screen.getByTitle('t-1').closest('tr');
      expect(row).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Given:a user is selected and the server reports a next page', () => {
    it('should fetch the next page with the stored cursor on "load more"', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      const { fetchTasksForUser } = mockTaskStore({
        items: [
          {
            id: 't-1',
            type: 'development',
            status: 1,
            statusName: 'created',
            isClosed: false,
            assignedUserId: 'u-1',
            customFields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        nextCursor: 'cursor-1',
      });

      renderMyTasksView();
      fireEvent.click(screen.getByTestId('task-list-load-more'));

      expect(fetchTasksForUser).toHaveBeenLastCalledWith('u-1', {
        isClosed: false,
        cursor: 'cursor-1',
      });
    });
  });
});
