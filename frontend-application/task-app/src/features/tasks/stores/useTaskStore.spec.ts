import { ErrorCode } from '@core/shared/error-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskEventPayload } from '../../../core/services/RealtimeService';
import type { ApiError } from '../../../core/types/api-error';
import { taskService } from '../services/taskService';
import type {
  ChangeTaskStatusDto,
  CreateTaskDto,
  TaskHistoryPage,
  TaskListPage,
} from '../services/taskService.dto';
import type { Task } from '../types';
import { useTaskStore } from './useTaskStore';

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));

vi.mock('../../../core/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('../../../core/bus/bus', () => ({
  bus: { emit: emitMock, on: vi.fn(), off: vi.fn() },
}));

// Spying on the singleton's methods (rather than mocking the whole module)
// keeps the real class instance in play while stubbing only the network calls.
const listTasksForUserMock = vi.spyOn(taskService, 'listTasksForUser');
const getTaskMock = vi.spyOn(taskService, 'getTask');
const createTaskMock = vi.spyOn(taskService, 'createTask');
const changeTaskStatusMock = vi.spyOn(taskService, 'changeTaskStatus');
const closeTaskMock = vi.spyOn(taskService, 'closeTask');
const getTaskHistoryMock = vi.spyOn(taskService, 'getTaskHistory');

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    type: 'development',
    status: 1,
    statusName: 'created',
    isClosed: false,
    assignedUserId: 'u-1',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useTaskStore', () => {
  const conflictError: ApiError = {
    errorCode: ErrorCode.TASK_STATE_CONFLICT,
    status: 409,
    isNetworkError: false,
  };

  const validationError: ApiError = {
    errorCode: ErrorCode.VALIDATION_ERROR,
    status: 400,
    isNetworkError: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.getState().reset();
  });

  describe('Given:fetching the first page of a user’s tasks succeeds', () => {
    it('should replace items and store the next cursor', async () => {
      const task = buildTask();
      const page: TaskListPage = { items: [task], nextCursor: 'cursor-1', limit: 20 };
      listTasksForUserMock.mockResolvedValueOnce(page);

      const result = await useTaskStore.getState().fetchTasksForUser('u-1', { isClosed: false });

      expect(result).toBe(true);
      expect(listTasksForUserMock).toHaveBeenCalledWith('u-1', { isClosed: false });
      expect(useTaskStore.getState()).toMatchObject({
        items: [task],
        nextCursor: 'cursor-1',
        isLoading: false,
        error: null,
      });
    });
  });

  describe('Given:fetching a subsequent page with a cursor', () => {
    it('should append the new items to the existing list', async () => {
      const firstTask = buildTask({ id: 't-1' });
      const secondTask = buildTask({ id: 't-2' });
      useTaskStore.setState({ items: [firstTask], nextCursor: 'cursor-1' });
      listTasksForUserMock.mockResolvedValueOnce({
        items: [secondTask],
        nextCursor: null,
        limit: 20,
      });

      const result = await useTaskStore.getState().fetchTasksForUser('u-1', { cursor: 'cursor-1' });

      expect(result).toBe(true);
      expect(useTaskStore.getState().items).toEqual([firstTask, secondTask]);
      expect(useTaskStore.getState().nextCursor).toBeNull();
    });
  });

  describe('Given:fetching a task by id succeeds', () => {
    it('should set the task as current and upsert it into the list', async () => {
      const task = buildTask({ status: 2, statusName: 'in-progress' });
      getTaskMock.mockResolvedValueOnce(task);

      const result = await useTaskStore.getState().fetchTask('t-1');

      expect(result).toBe(true);
      expect(useTaskStore.getState().currentTask).toEqual(task);
    });
  });

  describe('Given:creating a task succeeds', () => {
    it('should prepend the created task to the list and set it as current', async () => {
      const existing = buildTask({ id: 't-0' });
      useTaskStore.setState({ items: [existing] });
      const created = buildTask({ id: 't-1' });
      const dto: CreateTaskDto = { type: 'development', assignedUserId: 'u-1' };
      createTaskMock.mockResolvedValueOnce(created);

      const result = await useTaskStore.getState().createTask(dto);

      expect(result).toBe(true);
      expect(useTaskStore.getState().items).toEqual([created, existing]);
      expect(useTaskStore.getState().currentTask).toEqual(created);
    });
  });

  describe('Given:changing a task’s status succeeds', () => {
    it('should replace the task in the list and set it as current from the response body', async () => {
      const before = buildTask({ status: 1 });
      const after = buildTask({ status: 2, statusName: 'in-progress' });
      useTaskStore.setState({ items: [before] });
      const dto: ChangeTaskStatusDto = {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: 'u-2',
      };
      changeTaskStatusMock.mockResolvedValueOnce(after);

      const result = await useTaskStore.getState().changeTaskStatus('t-1', dto);

      expect(result).toBe(true);
      expect(useTaskStore.getState().items).toEqual([after]);
      expect(useTaskStore.getState().currentTask).toEqual(after);
      expect(emitMock).not.toHaveBeenCalled();
    });
  });

  describe('Given:changing a task’s status fails with a non-conflict error', () => {
    it('should set the error, emit an error toast, and not trigger a refetch', async () => {
      changeTaskStatusMock.mockRejectedValueOnce(validationError);
      const dto: ChangeTaskStatusDto = {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: 'u-2',
      };

      const result = await useTaskStore.getState().changeTaskStatus('t-1', dto);

      expect(result).toBe(false);
      expect(useTaskStore.getState().error).toEqual(validationError);
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.invalid-details',
      });
      expect(getTaskMock).not.toHaveBeenCalled();
    });
  });

  describe('Given:changing a task’s status fails with a stale expectedStatus (TASK_STATE_CONFLICT)', () => {
    it('should set the error, emit an error toast, and auto-refetch the task from the server', async () => {
      changeTaskStatusMock.mockRejectedValueOnce(conflictError);
      const refreshed = buildTask({ status: 3 });
      getTaskMock.mockResolvedValueOnce(refreshed);
      const dto: ChangeTaskStatusDto = {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: 'u-2',
      };

      const result = await useTaskStore.getState().changeTaskStatus('t-1', dto);

      expect(result).toBe(false);
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.task-changed',
      });
      // The auto-refetch replaces the stale task with the server's current
      // state — this is the recovery the toast promised, not just a log entry.
      await vi.waitFor(() => expect(getTaskMock).toHaveBeenCalledWith('t-1'));
      await vi.waitFor(() => expect(useTaskStore.getState().currentTask).toEqual(refreshed));
      expect(useTaskStore.getState().error).toBeNull();
    });
  });

  describe('Given:closing a task succeeds', () => {
    it('should replace the task in the list with the closed resource', async () => {
      const before = buildTask({ isClosed: false });
      const closed = buildTask({ isClosed: true });
      useTaskStore.setState({ items: [before] });
      closeTaskMock.mockResolvedValueOnce(closed);

      const result = await useTaskStore.getState().closeTask('t-1');

      expect(result).toBe(true);
      expect(useTaskStore.getState().items).toEqual([closed]);
    });
  });

  describe('Given:closing a task fails with a stale expectedStatus (TASK_STATE_CONFLICT)', () => {
    it('should auto-refetch the task from the server', async () => {
      closeTaskMock.mockRejectedValueOnce(conflictError);
      getTaskMock.mockResolvedValueOnce(buildTask());

      await useTaskStore.getState().closeTask('t-1');

      await vi.waitFor(() => expect(getTaskMock).toHaveBeenCalledWith('t-1'));
    });
  });

  describe('Given:fetching the first page of a task’s history succeeds', () => {
    it('should replace historyItems and store the next cursor', async () => {
      const page: TaskHistoryPage = {
        items: [
          {
            fromStatus: null,
            toStatus: 1,
            assignedUserId: 'u-1',
            fieldsSnapshot: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        nextCursor: 'cursor-1',
        limit: 20,
      };
      getTaskHistoryMock.mockResolvedValueOnce(page);

      const result = await useTaskStore.getState().fetchTaskHistory('t-1');

      expect(result).toBe(true);
      expect(getTaskHistoryMock).toHaveBeenCalledWith('t-1', undefined);
      expect(useTaskStore.getState()).toMatchObject({
        historyItems: page.items,
        historyNextCursor: 'cursor-1',
        isLoading: false,
        error: null,
      });
    });
  });

  describe('Given:fetching a subsequent page of a task’s history with a cursor', () => {
    it('should append the new entries to the existing history', async () => {
      const firstEntry = {
        fromStatus: null,
        toStatus: 1,
        assignedUserId: 'u-1',
        fieldsSnapshot: {},
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const secondEntry = {
        fromStatus: 1,
        toStatus: 2,
        assignedUserId: 'u-2',
        fieldsSnapshot: {},
        createdAt: '2026-01-02T00:00:00.000Z',
      };
      useTaskStore.setState({ historyItems: [firstEntry], historyNextCursor: 'cursor-1' });
      getTaskHistoryMock.mockResolvedValueOnce({
        items: [secondEntry],
        nextCursor: null,
        limit: 20,
      });

      const result = await useTaskStore.getState().fetchTaskHistory('t-1', { cursor: 'cursor-1' });

      expect(result).toBe(true);
      expect(useTaskStore.getState().historyItems).toEqual([firstEntry, secondEntry]);
      expect(useTaskStore.getState().historyNextCursor).toBeNull();
    });
  });

  describe('Given:fetching a task’s history fails', () => {
    it('should set the error and emit an error toast', async () => {
      getTaskHistoryMock.mockRejectedValueOnce(validationError);

      const result = await useTaskStore.getState().fetchTaskHistory('t-1');

      expect(result).toBe(false);
      expect(useTaskStore.getState().error).toEqual(validationError);
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.invalid-details',
      });
    });
  });

  describe('Given:reset is called after the store accumulated state', () => {
    it('should restore every field to its initial value while keeping the actions callable', () => {
      useTaskStore.setState({
        items: [buildTask()],
        nextCursor: 'cursor-1',
        currentTask: buildTask(),
        listUserId: 'u-1',
        historyItems: [
          {
            fromStatus: null,
            toStatus: 1,
            assignedUserId: 'u-1',
            fieldsSnapshot: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        historyNextCursor: 'cursor-1',
        error: validationError,
      });

      useTaskStore.getState().reset();

      expect(useTaskStore.getState()).toMatchObject({
        items: [],
        nextCursor: null,
        currentTask: null,
        listUserId: null,
        historyItems: [],
        historyNextCursor: null,
        isLoading: false,
        error: null,
      });
    });
  });

  describe('Given:applyTaskEvent receives a socket event', () => {
    // `updatedAt` always mirrors the resource's own `updatedAt` — the server
    // never sends the two out of sync — so deriving it from `task` here
    // keeps every case below from having to keep two timestamps in step.
    function buildEventPayload(task: Task): TaskEventPayload {
      return { task, updatedAt: task.updatedAt };
    }

    describe('When:the task is not known to the store yet', () => {
      it('should upsert it into the list when it belongs to the currently loaded list', () => {
        useTaskStore.setState({ items: [], listUserId: 'u-1' });
        const payload = buildEventPayload(buildTask({ assignedUserId: 'u-1' }));

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([payload.task]);
      });

      it('should not add it to the list when it is assigned to a different user than the loaded list', () => {
        useTaskStore.setState({ items: [], listUserId: 'u-1' });
        const payload = buildEventPayload(buildTask({ assignedUserId: 'u-2' }));

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([]);
      });

      it('should update currentTask when it matches the viewed task, regardless of the loaded list', () => {
        useTaskStore.setState({ currentTask: buildTask(), listUserId: null });
        const payload = buildEventPayload(
          buildTask({
            status: 2,
            statusName: 'in-progress',
            updatedAt: '2026-01-01T00:00:01.000000Z',
          }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().currentTask).toEqual(payload.task);
      });
    });

    describe('When:the event reassigns a task away from the currently loaded list', () => {
      it('should drop it from items', () => {
        const existing = buildTask({
          assignedUserId: 'u-1',
          updatedAt: '2026-01-01T00:00:00.000000Z',
        });
        useTaskStore.setState({ items: [existing], listUserId: 'u-1' });
        const payload = buildEventPayload(
          buildTask({ assignedUserId: 'u-2', updatedAt: '2026-01-01T00:00:01.000000Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([]);
      });
    });

    describe('When:the payload’s updatedAt is older than the known task’s', () => {
      it('should ignore the event', () => {
        const known = buildTask({ status: 2, updatedAt: '2026-01-01T00:00:02.000000Z' });
        useTaskStore.setState({ items: [known], listUserId: 'u-1' });
        const payload = buildEventPayload(
          buildTask({ status: 3, updatedAt: '2026-01-01T00:00:01.000000Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([known]);
      });
    });

    describe('When:the payload’s updatedAt exactly equals the known task’s', () => {
      it('should ignore the event', () => {
        const known = buildTask({ status: 2, updatedAt: '2026-01-01T00:00:02.000000Z' });
        useTaskStore.setState({ items: [known], listUserId: 'u-1' });
        const payload = buildEventPayload(
          buildTask({ status: 3, updatedAt: '2026-01-01T00:00:02.000000Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([known]);
      });
    });

    describe('When:the payload’s updatedAt is newer than the known task’s', () => {
      it('should apply the event', () => {
        const known = buildTask({ status: 2, updatedAt: '2026-01-01T00:00:02.000000Z' });
        useTaskStore.setState({ items: [known], listUserId: 'u-1' });
        const payload = buildEventPayload(
          buildTask({ status: 3, updatedAt: '2026-01-01T00:00:03.000000Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([payload.task]);
      });
    });

    describe('When:two updates land in the same millisecond but different microseconds', () => {
      it('should apply the microsecond-newer update instead of tying on the millisecond-truncated value', () => {
        const known = buildTask({ status: 2, updatedAt: '2026-01-01T00:00:00.123456Z' });
        useTaskStore.setState({ items: [known], listUserId: 'u-1' });
        // Both timestamps round to the same ".123Z" if truncated to milliseconds —
        // only the full microsecond string tells them apart.
        const payload = buildEventPayload(
          buildTask({ status: 3, updatedAt: '2026-01-01T00:00:00.123457Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([payload.task]);
      });

      it('should ignore a microsecond-older update within the same millisecond', () => {
        const known = buildTask({ status: 2, updatedAt: '2026-01-01T00:00:00.123457Z' });
        useTaskStore.setState({ items: [known], listUserId: 'u-1' });
        const payload = buildEventPayload(
          buildTask({ status: 3, updatedAt: '2026-01-01T00:00:00.123456Z' }),
        );

        useTaskStore.getState().applyTaskEvent(payload);

        expect(useTaskStore.getState().items).toEqual([known]);
      });
    });
  });
});
