import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { bus } from '../../../../core/bus/bus';
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
      isLoading: false,
      error: null,
      fetchUsers: vi.fn(),
      reset: vi.fn(),
    };
    const taskState: TaskStoreState = {
      items: [],
      nextCursor: null,
      currentTask: null,
      listUserId: null,
      isLoading: overrides.isLoading ?? false,
      error: null,
      historyItems: [],
      historyNextCursor: null,
      fetchTasksForUser: vi.fn(),
      fetchTask: vi.fn(),
      fetchTaskHistory: vi.fn(),
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

  function pickTypeAndAssignee(): void {
    fireEvent.click(screen.getByLabelText('create-task-form.type-label'));
    fireEvent.click(screen.getByRole('option', { name: 'Development' }));
    fireEvent.click(screen.getByLabelText('create-task-form.assignee-label'));
    fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
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

  describe('Given:the assignee picker is open', () => {
    it('should render an avatar beside each assignee option', () => {
      render(<CreateTaskForm />);

      fireEvent.click(screen.getByLabelText('create-task-form.assignee-label'));

      const option = screen.getByRole('option', { name: 'Alice' });
      expect(within(option).getByRole('img', { hidden: true })).toBeInTheDocument();
    });
  });

  describe('Given:a type and an assignee are picked', () => {
    it('should enable the submit button', () => {
      render(<CreateTaskForm />);

      pickTypeAndAssignee();

      expect(screen.getByTestId('create-task-form-submit')).toBeEnabled();
    });
  });

  describe('Given:a valid submission succeeds', () => {
    it('should create the task, clear the form, show a success toast, and close the modal', async () => {
      createTask.mockResolvedValueOnce(true);
      const modalCloseHandler = vi.fn();
      const unsubscribe = bus.on('modal:close', modalCloseHandler);
      render(<CreateTaskForm />);

      pickTypeAndAssignee();
      fireEvent.click(screen.getByTestId('create-task-form-submit'));

      await vi.waitFor(() =>
        expect(createTask).toHaveBeenCalledWith({ type: 'development', assignedUserId: 'u-1' }),
      );
      await vi.waitFor(() =>
        expect(toastSuccessMock).toHaveBeenCalledWith('create-task-form.success-toast'),
      );
      await vi.waitFor(() =>
        expect(screen.getByLabelText('create-task-form.type-label')).toHaveTextContent(
          'create-task-form.type-placeholder',
        ),
      );
      expect(modalCloseHandler).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  describe('Given:a valid submission fails', () => {
    it('should keep the picked values, not show a success toast, and not close the modal', async () => {
      createTask.mockResolvedValueOnce(false);
      const modalCloseHandler = vi.fn();
      const unsubscribe = bus.on('modal:close', modalCloseHandler);
      render(<CreateTaskForm />);

      pickTypeAndAssignee();
      fireEvent.click(screen.getByTestId('create-task-form-submit'));

      await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(screen.getByLabelText('create-task-form.type-label')).toHaveTextContent('Development');
      expect(modalCloseHandler).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
