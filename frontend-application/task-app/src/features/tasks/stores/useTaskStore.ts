import { ErrorCode } from '@core/shared/error-codes';
import { create } from 'zustand';

import { bus } from '../../../core/bus/bus';
import i18n from '../../../core/i18n';
import type { TaskEventPayload } from '../../../core/services/RealtimeService';
import type { ApiError } from '../../../core/types/api-error';
import { resolveErrorText } from '../../../shared/utils/resolveErrorText';
import { taskService } from '../services/taskService';
import type {
  ChangeTaskStatusDto,
  CreateTaskDto,
  TaskHistoryEntry,
  TaskListFilters,
} from '../services/taskService.dto';
import type { Task } from '../types';

export interface FetchTasksForUserOptions extends TaskListFilters {
  /** Omit for the first page; pass the store's `nextCursor` to load the next one. */
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FetchTaskHistoryOptions {
  /** Omit for the first page; pass the store's `historyNextCursor` to load the next one. */
  readonly cursor?: string;
  readonly limit?: number;
}

export interface TaskStoreState {
  readonly items: readonly Task[];
  readonly nextCursor: string | null;
  readonly currentTask: Task | null;
  /** The user the currently loaded `items` page was fetched for — `applyTaskEvent` needs it to tell "reassigned onto this list" from "reassigned away from it". */
  readonly listUserId: string | null;
  readonly historyItems: readonly TaskHistoryEntry[];
  readonly historyNextCursor: string | null;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  fetchTasksForUser: (userId: string, options?: FetchTasksForUserOptions) => Promise<boolean>;
  fetchTask: (taskId: string) => Promise<boolean>;
  createTask: (dto: CreateTaskDto) => Promise<boolean>;
  changeTaskStatus: (taskId: string, dto: ChangeTaskStatusDto) => Promise<boolean>;
  closeTask: (taskId: string) => Promise<boolean>;
  fetchTaskHistory: (taskId: string, options?: FetchTaskHistoryOptions) => Promise<boolean>;
  applyTaskEvent: (payload: TaskEventPayload) => void;
  reset: () => void;
}

const initialState: Pick<
  TaskStoreState,
  | 'items'
  | 'nextCursor'
  | 'currentTask'
  | 'listUserId'
  | 'historyItems'
  | 'historyNextCursor'
  | 'isLoading'
  | 'error'
> = {
  items: [],
  nextCursor: null,
  currentTask: null,
  listUserId: null,
  historyItems: [],
  historyNextCursor: null,
  isLoading: false,
  error: null,
};

function replaceTaskInList(items: readonly Task[], task: Task): readonly Task[] {
  return items.map((item) => (item.id === task.id ? task : item));
}

function findKnownTask(state: TaskStoreState, taskId: string): Task | undefined {
  return (
    state.items.find((item) => item.id === taskId) ??
    (state.currentTask?.id === taskId ? state.currentTask : undefined)
  );
}

/**
 * Both the REST response and the event payload serialize the server's
 * commit timestamp as a fixed-length microsecond ISO string, so plain
 * lexicographic comparison already equals chronological comparison —
 * parsing either side to `Date` would round-trip through millisecond
 * precision and could tie two updates to the same task that landed in the
 * same millisecond but different microseconds, silently keeping the older
 * one instead of applying the newer.
 */
function isStaleEvent(payloadUpdatedAt: string, knownUpdatedAt: string): boolean {
  return payloadUpdatedAt <= knownUpdatedAt;
}

/**
 * A task leaves the currently loaded list the moment the event's resource is
 * no longer assigned to the user that list was fetched for — reassigning it
 * away must drop it here exactly as a manual refetch would, or the list
 * silently rots for whoever it was just taken from.
 */
function applyEventToItems(
  items: readonly Task[],
  task: Task,
  listUserId: string | null,
): readonly Task[] {
  const isInList = items.some((item) => item.id === task.id);
  const belongsToList = listUserId !== null && task.assignedUserId === listUserId;

  if (belongsToList) {
    return isInList ? replaceTaskInList(items, task) : [task, ...items];
  }

  return isInList ? items.filter((item) => item.id !== task.id) : items;
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
      set({ items, nextCursor: page.nextCursor, listUserId: userId });
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

  fetchTaskHistory: async (taskId, options): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const page = await taskService.getTaskHistory(taskId, options);
      const historyItems = options?.cursor ? [...get().historyItems, ...page.items] : page.items;
      set({ historyItems, historyNextCursor: page.nextCursor });
      return true;
    } catch (caughtError) {
      return handleTaskRequestFailure(caughtError, set);
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * The one inbound channel besides HTTP responses: applies a socket task
   * event with the same last-write-wins guard every store mutation already
   * gets from `expectedStatus`, so a duplicate or out-of-order delivery is a
   * no-op rather than a flicker back to older state.
   */
  applyTaskEvent: ({ task, updatedAt }): void => {
    const state = get();
    const known = findKnownTask(state, task.id);
    if (known && isStaleEvent(updatedAt, known.updatedAt)) return;

    set({
      items: applyEventToItems(state.items, task, state.listUserId),
      currentTask: state.currentTask?.id === task.id ? task : state.currentTask,
    });
  },

  reset: (): void => set(initialState),
}));
