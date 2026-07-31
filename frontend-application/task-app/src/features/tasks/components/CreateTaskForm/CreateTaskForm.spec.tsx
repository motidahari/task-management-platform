import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { CurrentUserStoreState } from '../../stores/useCurrentUserStore';
import { useCurrentUserStore } from '../../stores/useCurrentUserStore';
import type { TaskStoreState } from '../../stores/useTaskStore';
import { useTaskStore } from '../../stores/useTaskStore';
import type { TaskTypeStoreState } from '../../stores/useTaskTypeStore';
import { useTaskTypeStore } from '../../stores/useTaskTypeStore';
import type { TaskTypeDefinition, User } from '../../types';
import { CreateTaskForm } from './CreateTaskForm';

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../../../../shared/hooks/useToast', () => ({
  useToast: () => ({ success: toastSuccessMock, error: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../stores/useTaskTypeStore', () => ({ useTaskTypeStore: vi.fn() }));
vi.mock('../../stores/useCurrentUserStore', () => ({ useCurrentUserStore: vi.fn() }));
vi.mock('../../stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));

const mockedUseTaskTypeStore = vi.mocked(useTaskTypeStore);
const mockedUseCurrentUserStore = vi.mocked(useCurrentUserStore);
const mockedUseTaskStore = vi.mocked(useTaskStore);

describe('CreateTaskForm', () => {
  const definitions: readonly TaskTypeDefinition[] = [
    { type: 'development', displayName: 'Development', finalStatus: 4, statuses: [] },
  ];
  const users: readonly User[] = [{ id: 'u-1', name: 'Alice', email: 'alice@demo.local' }];

  let createTask: Mock<TaskStoreState['createTask']>;

  function mockStores(overrides: { isLoading?: boolean } = {}): void {
    const taskTypeState: TaskTypeStoreState = {
      status: 'ready',
      definitions,
      error: null,
      loadTaskTypes: vi.fn(),
    };
    const currentUserState: CurrentUserStoreState = {
      users,
      selectedUserId: null,
      isLoading: false,
      error: null,
      fetchUsers: vi.fn(),
      selectUser: vi.fn(),
      reset: vi.fn(),
    };
    const taskState: TaskStoreState = {
      items: [],
      nextCursor: null,
      currentTask: null,
      listUserId: null,
      isLoading: overrides.isLoading ?? false,
      error: null,
      fetchTasksForUser: vi.fn(),
      fetchTask: vi.fn(),
      createTask,
      changeTaskStatus: vi.fn(),
      closeTask: vi.fn(),
      applyTaskEvent: vi.fn(),
      reset: vi.fn(),
    };

    mockedUseTaskTypeStore.mockImplementation((selector: (state: TaskTypeStoreState) => unknown) =>
      selector(taskTypeState),
    );
    mockedUseCurrentUserStore.mockImplementation(
      (selector: (state: CurrentUserStoreState) => unknown) => selector(currentUserState),
    );
    mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
      selector(taskState),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createTask = vi.fn();
    mockStores();
  });

  describe('Given:no type or assignee picked yet', () => {
    it('should render the submit button disabled', () => {
      render(<CreateTaskForm />);

      expect(screen.getByTestId('create-task-form-submit')).toBeDisabled();
    });
  });

  describe('Given:a type and an assignee are picked', () => {
    it('should enable the submit button', () => {
      render(<CreateTaskForm />);

      fireEvent.change(screen.getByLabelText('create-task-form.type-label'), {
        target: { value: 'development' },
      });
      fireEvent.change(screen.getByLabelText('create-task-form.assignee-label'), {
        target: { value: 'u-1' },
      });

      expect(screen.getByTestId('create-task-form-submit')).toBeEnabled();
    });
  });

  describe('Given:a valid submission succeeds', () => {
    it('should create the task, clear the form, and show a success toast', async () => {
      createTask.mockResolvedValueOnce(true);
      render(<CreateTaskForm />);

      fireEvent.change(screen.getByLabelText('create-task-form.type-label'), {
        target: { value: 'development' },
      });
      fireEvent.change(screen.getByLabelText('create-task-form.assignee-label'), {
        target: { value: 'u-1' },
      });
      fireEvent.click(screen.getByTestId('create-task-form-submit'));

      await vi.waitFor(() =>
        expect(createTask).toHaveBeenCalledWith({ type: 'development', assignedUserId: 'u-1' }),
      );
      await vi.waitFor(() =>
        expect(toastSuccessMock).toHaveBeenCalledWith('create-task-form.success-toast'),
      );
      await vi.waitFor(() =>
        expect(screen.getByLabelText('create-task-form.type-label')).toHaveValue(''),
      );
    });
  });

  describe('Given:a valid submission fails', () => {
    it('should keep the picked values and not show a success toast', async () => {
      createTask.mockResolvedValueOnce(false);
      render(<CreateTaskForm />);

      fireEvent.change(screen.getByLabelText('create-task-form.type-label'), {
        target: { value: 'development' },
      });
      fireEvent.change(screen.getByLabelText('create-task-form.assignee-label'), {
        target: { value: 'u-1' },
      });
      fireEvent.click(screen.getByTestId('create-task-form-submit'));

      await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(screen.getByLabelText('create-task-form.type-label')).toHaveValue('development');
    });
  });
});
