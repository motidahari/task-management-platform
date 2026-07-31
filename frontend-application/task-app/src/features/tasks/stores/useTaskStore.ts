import { ErrorCode } from '@core/shared/error-codes';
import { create } from 'zustand';

import { bus } from '../../../core/bus/bus';
import i18n from '../../../core/i18n';
import type { ApiError } from '../../../core/types/api-error';
import { resolveErrorText } from '../../../shared/utils/resolveErrorText';
import { taskService } from '../services/taskService';
import type { ChangeTaskStatusDto, CreateTaskDto, Task, TaskListFilters } from '../types';

export interface FetchTasksForUserOptions extends TaskListFilters {
  /** Omit for the first page; pass the store's `nextCursor` to load the next one. */
  readonly cursor?: string;
  readonly limit?: number;
}

export interface TaskStoreState {
  readonly items: readonly Task[];
  readonly nextCursor: string | null;
  readonly currentTask: Task | null;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  fetchTasksForUser: (userId: string, options?: FetchTasksForUserOptions) => Promise<boolean>;
  fetchTask: (taskId: string) => Promise<boolean>;
  createTask: (dto: CreateTaskDto) => Promise<boolean>;
  changeTaskStatus: (taskId: string, dto: ChangeTaskStatusDto) => Promise<boolean>;
  closeTask: (taskId: string) => Promise<boolean>;
  reset: () => void;
}

const initialState: Pick<
  TaskStoreState,
  'items' | 'nextCursor' | 'currentTask' | 'isLoading' | 'error'
> = {
  items: [],
  nextCursor: null,
  currentTask: null,
  isLoading: false,
  error: null,
};

function replaceTaskInList(items: readonly Task[], task: Task): readonly Task[] {
  return items.map((item) => (item.id === task.id ? task : item));
}

interface ConflictRecovery {
  readonly taskId: string;
  readonly refetchTask: (taskId: string) => Promise<boolean>;
}

/**
 * The terminal handling point for a failed task request: sets `error` and
 * surfaces client-owned copy via the toast bus (the server's own
 * `errorMessage` is never rendered — see `resolveErrorText`). When the
 * caller supplies `conflictRecovery` (mutations that carry an
 * `expectedStatus` precondition) and the failure is specifically a stale
 * precondition, it additionally kicks off a silent background refetch so the
 * view lands on the true server state instead of staying stuck on what the
 * user last saw. Returns `false` so the calling action can report failure
 * without rethrowing; nothing above this ever sees the error.
 */
function handleTaskRequestFailure(
  caughtError: unknown,
  set: (partial: Partial<TaskStoreState>) => void,
  conflictRecovery?: ConflictRecovery,
): false {
  const apiError = caughtError as ApiError;
  set({ error: apiError });
  bus.emit('toast:show', { kind: 'error', text: resolveErrorText(apiError, i18n.t) });

  if (apiError.errorCode === ErrorCode.TASK_STATE_CONFLICT && conflictRecovery) {
    void conflictRecovery.refetchTask(conflictRecovery.taskId);
  }

  return false;
}

/**
 * Task list + detail state for the current session: a keyset-paginated
 * collection (`items`/`nextCursor`) plus whichever task is open in the
 * detail view (`currentTask`). Every mutation replaces the affected task
 * from the response body instead of round-tripping a refetch, except a
 * `TASK_STATE_CONFLICT`, whose only safe recovery is re-reading the server's
 * current state (see `handleTaskRequestFailure`).
 */
export const useTaskStore = create<TaskStoreState>()((set, get) => ({
  ...initialState,

  fetchTasksForUser: async (userId, options): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const page = await taskService.listTasksForUser(userId, options);
      const items = options?.cursor ? [...get().items, ...page.items] : page.items;
      set({ items, nextCursor: page.nextCursor });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTask: async (taskId): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const task = await taskService.getTask(taskId);
      set({ currentTask: task, items: replaceTaskInList(get().items, task) });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set);
    } finally {
      set({ isLoading: false });
    }
  },

  createTask: async (dto): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const task = await taskService.createTask(dto);
      set({ currentTask: task, items: [task, ...get().items] });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set);
    } finally {
      set({ isLoading: false });
    }
  },

  changeTaskStatus: async (taskId, dto): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const task = await taskService.changeTaskStatus(taskId, dto);
      set({ currentTask: task, items: replaceTaskInList(get().items, task) });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set, { taskId, refetchTask: get().fetchTask });
    } finally {
      set({ isLoading: false });
    }
  },

  closeTask: async (taskId): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const task = await taskService.closeTask(taskId);
      set({ currentTask: task, items: replaceTaskInList(get().items, task) });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set, { taskId, refetchTask: get().fetchTask });
    } finally {
      set({ isLoading: false });
    }
  },

  reset: (): void => set(initialState),
}));
