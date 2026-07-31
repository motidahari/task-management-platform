import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bus } from '../../../core/bus/bus';
import type { TaskStoreState } from '../stores/useTaskStore';
import { useTaskStore } from '../stores/useTaskStore';
import type { TaskRealtimeTarget } from './useTaskRealtime';
import { useTaskRealtime } from './useTaskRealtime';

// Plain object literals (rather than `vi.mocked(realtimeService)`) so the
// mocked methods stay ordinary function-typed properties instead of
// unbound class methods — referencing the latter directly in an assertion
// is exactly the footgun the `unbound-method` lint rule exists to catch.
const { mockedRealtimeService } = vi.hoisted(() => ({
  mockedRealtimeService: {
    joinUser: vi.fn(),
    leaveUser: vi.fn(),
    joinTask: vi.fn(),
    leaveTask: vi.fn(),
    on: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../../core/services/RealtimeService', () => ({
  realtimeService: mockedRealtimeService,
}));

vi.mock('../stores/useTaskStore', () => ({
  useTaskStore: vi.fn(),
}));

describe('useTaskRealtime', () => {
  const mockedUseTaskStore = vi.mocked(useTaskStore);
  const applyTaskEvent = vi.fn();

  function renderTaskRealtime(
    target: TaskRealtimeTarget,
    refetch: () => void,
  ): ReturnType<typeof renderHook> {
    return renderHook(() => useTaskRealtime(target, refetch));
  }

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
    changeTaskStatus: vi.fn(),
    closeTask: vi.fn(),
    fetchTaskHistory: vi.fn(),
    applyTaskEvent,
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
      selector(storeState),
    );
  });

  describe('Given:a list view mounted for a user', () => {
    it('should join that user’s room and subscribe to every task event', () => {
      renderTaskRealtime({ mode: 'list', userId: 'u-1' }, vi.fn());

      expect(mockedRealtimeService.joinUser).toHaveBeenCalledWith('u-1');
      expect(mockedRealtimeService.joinTask).not.toHaveBeenCalled();
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:created', applyTaskEvent);
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:updated', applyTaskEvent);
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:closed', applyTaskEvent);
    });

    it('should leave that user’s room on unmount', () => {
      const { unmount } = renderTaskRealtime({ mode: 'list', userId: 'u-1' }, vi.fn());

      unmount();

      expect(mockedRealtimeService.leaveUser).toHaveBeenCalledWith('u-1');
    });
  });

  describe('Given:a detail view mounted for a task', () => {
    it('should join that task’s room and subscribe to every task event', () => {
      renderTaskRealtime({ mode: 'detail', taskId: 't-1' }, vi.fn());

      expect(mockedRealtimeService.joinTask).toHaveBeenCalledWith('t-1');
      expect(mockedRealtimeService.joinUser).not.toHaveBeenCalled();
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:created', applyTaskEvent);
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:updated', applyTaskEvent);
      expect(mockedRealtimeService.on).toHaveBeenCalledWith('task:closed', applyTaskEvent);
    });

    it('should leave that task’s room on unmount', () => {
      const { unmount } = renderTaskRealtime({ mode: 'detail', taskId: 't-1' }, vi.fn());

      unmount();

      expect(mockedRealtimeService.leaveTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('Given:the component unmounts', () => {
    it('should unsubscribe every event handler that was registered on mount', () => {
      const [unsubscribeCreated, unsubscribeUpdated, unsubscribeClosed] = [
        vi.fn(),
        vi.fn(),
        vi.fn(),
      ];
      mockedRealtimeService.on
        .mockImplementationOnce(() => unsubscribeCreated)
        .mockImplementationOnce(() => unsubscribeUpdated)
        .mockImplementationOnce(() => unsubscribeClosed);

      const { unmount } = renderTaskRealtime({ mode: 'detail', taskId: 't-1' }, vi.fn());
      unmount();

      expect(unsubscribeCreated).toHaveBeenCalledTimes(1);
      expect(unsubscribeUpdated).toHaveBeenCalledTimes(1);
      expect(unsubscribeClosed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:the bus reports the socket reconnected', () => {
    it('should call the supplied refetch function', () => {
      const refetch = vi.fn();
      renderTaskRealtime({ mode: 'list', userId: 'u-1' }, refetch);

      bus.emit('realtime:reconnected');

      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('should not call refetch before the owning component mounted, and not after it unmounted', () => {
      const refetch = vi.fn();
      const { unmount } = renderTaskRealtime({ mode: 'list', userId: 'u-1' }, refetch);
      unmount();

      bus.emit('realtime:reconnected');

      expect(refetch).not.toHaveBeenCalled();
    });
  });
});
