import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStoreState } from '../stores/useTaskStore';
import { useTaskStore } from '../stores/useTaskStore';
import { useTaskLifecycle } from './useTaskLifecycle';

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../shared/hooks/useToast', () => ({ useToast: () => toastMock }));
vi.mock('../stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));

describe('useTaskLifecycle', () => {
  const mockedUseTaskStore = vi.mocked(useTaskStore);
  const changeTaskStatus = vi.fn();
  const closeTask = vi.fn();

  const storeState: TaskStoreState = {
    items: [],
    nextCursor: null,
    currentTask: null,
    listUserId: null,
    historyItems: [],
    historyNextCursor: null,
    isLoading: false,
    error: null,
    fetchTasksForUser: vi.fn(),
    fetchTask: vi.fn(),
    createTask: vi.fn(),
    changeTaskStatus,
    closeTask,
    fetchTaskHistory: vi.fn(),
    applyTaskEvent: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
      selector(storeState),
    );
  });

  describe('Given:advance is called', () => {
    it('should change the status forward with the given precondition and assignee', async () => {
      changeTaskStatus.mockResolvedValueOnce(true);
      const { result } = renderHook(() => useTaskLifecycle());

      let outcome = false;
      await act(async () => {
        outcome = await result.current.advance({
          taskId: 't-1',
          expectedStatus: 1,
          nextAssignedUserId: 'u-2',
          customFields: { branchName: 'feature/login' },
        });
      });

      expect(changeTaskStatus).toHaveBeenCalledWith('t-1', {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: 'u-2',
        customFields: { branchName: 'feature/login' },
      });
      expect(outcome).toBe(true);
    });

    it('should toast success only when the store reports success', async () => {
      changeTaskStatus.mockResolvedValueOnce(true);
      const { result } = renderHook(() => useTaskLifecycle());

      await act(async () => {
        await result.current.advance({
          taskId: 't-1',
          expectedStatus: 1,
          nextAssignedUserId: 'u-2',
        });
      });

      expect(toastMock.success).toHaveBeenCalledWith('task-lifecycle.advanced-toast');
    });

    it('should return false and not toast when the store reports failure, never surfacing the error itself', async () => {
      changeTaskStatus.mockResolvedValueOnce(false);
      const { result } = renderHook(() => useTaskLifecycle());

      let outcome = true;
      await act(async () => {
        outcome = await result.current.advance({
          taskId: 't-1',
          expectedStatus: 1,
          nextAssignedUserId: 'u-2',
        });
      });

      expect(outcome).toBe(false);
      expect(toastMock.success).not.toHaveBeenCalled();
      expect(toastMock.error).not.toHaveBeenCalled();
    });
  });

  describe('Given:reverse is called', () => {
    it('should change the status backward without customFields', async () => {
      changeTaskStatus.mockResolvedValueOnce(true);
      const { result } = renderHook(() => useTaskLifecycle());

      await act(async () => {
        await result.current.reverse({
          taskId: 't-1',
          expectedStatus: 2,
          nextAssignedUserId: 'u-1',
        });
      });

      expect(changeTaskStatus).toHaveBeenCalledWith('t-1', {
        direction: 'backward',
        expectedStatus: 2,
        nextAssignedUserId: 'u-1',
      });
      expect(toastMock.success).toHaveBeenCalledWith('task-lifecycle.reversed-toast');
    });

    it('should return false without toasting when the store reports failure', async () => {
      changeTaskStatus.mockResolvedValueOnce(false);
      const { result } = renderHook(() => useTaskLifecycle());

      let outcome = true;
      await act(async () => {
        outcome = await result.current.reverse({
          taskId: 't-1',
          expectedStatus: 2,
          nextAssignedUserId: 'u-1',
        });
      });

      expect(outcome).toBe(false);
      expect(toastMock.success).not.toHaveBeenCalled();
    });
  });

  describe('Given:close is called', () => {
    it('should close the task and toast success on true', async () => {
      closeTask.mockResolvedValueOnce(true);
      const { result } = renderHook(() => useTaskLifecycle());

      let outcome = false;
      await act(async () => {
        outcome = await result.current.close('t-1');
      });

      expect(closeTask).toHaveBeenCalledWith('t-1');
      expect(outcome).toBe(true);
      expect(toastMock.success).toHaveBeenCalledWith('task-lifecycle.closed-toast');
    });

    it('should return false without toasting when the store reports failure', async () => {
      closeTask.mockResolvedValueOnce(false);
      const { result } = renderHook(() => useTaskLifecycle());

      let outcome = true;
      await act(async () => {
        outcome = await result.current.close('t-1');
      });

      expect(outcome).toBe(false);
      expect(toastMock.success).not.toHaveBeenCalled();
    });
  });

  describe('Given:the store reports a mutation in flight', () => {
    it('should expose isSubmitting from the store’s isLoading', () => {
      mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
        selector({ ...storeState, isLoading: true }),
      );

      const { result } = renderHook(() => useTaskLifecycle());

      expect(result.current.isSubmitting).toBe(true);
    });
  });
});
