import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserStoreState } from '../stores/useCurrentUserStore';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import type { TaskStoreState } from '../stores/useTaskStore';
import { useTaskStore } from '../stores/useTaskStore';
import type { User } from '../types';
import { MyTasksView } from './MyTasksView';

vi.mock('../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../components/CreateTaskForm', () => ({
  CreateTaskForm: () => <div data-testid="create-task-form-stub" />,
}));

vi.mock('../hooks/useTaskRealtime', () => ({ useTaskRealtime: vi.fn() }));

vi.mock('../stores/useCurrentUserStore', () => ({ useCurrentUserStore: vi.fn() }));
vi.mock('../stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));

const mockedUseCurrentUserStore = vi.mocked(useCurrentUserStore);
const mockedUseTaskStore = vi.mocked(useTaskStore);

const users: readonly User[] = [{ id: 'u-1', name: 'Alice', email: 'alice@demo.local' }];

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

function renderMyTasksView(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <MyTasksView />
    </MemoryRouter>,
  );
}

describe('MyTasksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:the view mounts', () => {
    it('should load the user list once', () => {
      const { fetchUsers } = mockCurrentUserStore();
      mockTaskStore();

      renderMyTasksView();

      expect(fetchUsers).toHaveBeenCalledTimes(1);
    });

    it('should render the create-task form and the create pane', () => {
      mockCurrentUserStore();
      mockTaskStore();

      renderMyTasksView();

      expect(screen.getByTestId('create-task-form-stub')).toBeInTheDocument();
    });
  });

  describe('Given:no user is selected yet', () => {
    it('should prompt to select one instead of showing a task list', () => {
      mockCurrentUserStore({ selectedUserId: null });
      mockTaskStore();

      renderMyTasksView();

      expect(screen.getByText('my-tasks-view.select-user-prompt')).toBeInTheDocument();
      expect(screen.queryByTestId('task-list')).not.toBeInTheDocument();
    });
  });

  describe('Given:a user is selected', () => {
    it('should fetch the first page of open tasks for that user', () => {
      mockCurrentUserStore({ selectedUserId: 'u-1' });
      const { fetchTasksForUser } = mockTaskStore();

      renderMyTasksView();

      expect(fetchTasksForUser).toHaveBeenCalledWith('u-1', { isClosed: false });
      expect(screen.getByTestId('task-list')).toBeInTheDocument();
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
