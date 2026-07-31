import { ErrorCode } from '@core/shared/error-codes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '../../../core/types/api-error';
import { taskTypeService } from '../services/taskTypeService';
import type { TaskTypeDefinition } from '../types';
import { useTaskTypeStore } from './useTaskTypeStore';

// Spying on the singleton's method (rather than mocking the whole module)
// keeps the real class instance in play while stubbing only the network call.
const getTaskTypesMock = vi.spyOn(taskTypeService, 'getTaskTypes');

describe('useTaskTypeStore', () => {
  const definitions: TaskTypeDefinition[] = [
    { type: 'procurement', displayName: 'Procurement', finalStatus: 3, statuses: [] },
  ];

  const networkFailure: ApiError = {
    errorCode: ErrorCode.INTERNAL_ERROR,
    status: 0,
    isNetworkError: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useTaskTypeStore.setState({ status: 'idle', definitions: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Given:the task-type request succeeds on the first attempt', () => {
    it('should resolve to the ready status carrying the loaded definitions', async () => {
      getTaskTypesMock.mockResolvedValueOnce(definitions);

      await useTaskTypeStore.getState().loadTaskTypes();

      expect(useTaskTypeStore.getState()).toMatchObject({
        status: 'ready',
        definitions,
        error: null,
      });
      expect(getTaskTypesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:the request fails then succeeds within the retry budget', () => {
    it('should back off between attempts and resolve to ready once a retry succeeds', async () => {
      getTaskTypesMock.mockRejectedValueOnce(networkFailure).mockResolvedValueOnce(definitions);

      const loadPromise = useTaskTypeStore.getState().loadTaskTypes();

      // First attempt runs immediately, fails, and schedules a backed-off retry —
      // the second attempt must not fire before that delay elapses.
      await vi.advanceTimersByTimeAsync(0);
      expect(getTaskTypesMock).toHaveBeenCalledTimes(1);
      expect(useTaskTypeStore.getState().status).toBe('loading');

      await vi.advanceTimersByTimeAsync(500);
      await loadPromise;

      expect(getTaskTypesMock).toHaveBeenCalledTimes(2);
      expect(useTaskTypeStore.getState()).toMatchObject({
        status: 'ready',
        definitions,
        error: null,
      });
    });
  });

  describe('Given:the request fails on every attempt of the retry budget', () => {
    it('should retry twice more with a growing backoff then surface the error', async () => {
      getTaskTypesMock.mockRejectedValue(networkFailure);

      const loadPromise = useTaskTypeStore.getState().loadTaskTypes();

      await vi.advanceTimersByTimeAsync(0);
      expect(getTaskTypesMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(getTaskTypesMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      await loadPromise;

      expect(getTaskTypesMock).toHaveBeenCalledTimes(3);
      expect(useTaskTypeStore.getState()).toMatchObject({
        status: 'error',
        definitions: [],
        error: networkFailure,
      });
    });
  });

  describe('Given:a manual retry after a failed load', () => {
    it('should re-run the full attempt budget and resolve to ready on success', async () => {
      getTaskTypesMock.mockRejectedValue(networkFailure);
      const firstLoad = useTaskTypeStore.getState().loadTaskTypes();
      await vi.advanceTimersByTimeAsync(1500);
      await firstLoad;
      expect(useTaskTypeStore.getState().status).toBe('error');

      getTaskTypesMock.mockReset();
      getTaskTypesMock.mockResolvedValueOnce(definitions);
      await useTaskTypeStore.getState().loadTaskTypes();

      expect(useTaskTypeStore.getState()).toMatchObject({
        status: 'ready',
        definitions,
        error: null,
      });
    });
  });
});
