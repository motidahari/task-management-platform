import type { Task } from '../types';

/** Opaque, server-issued keyset cursor — the client only ever passes it back verbatim. */
export type TaskListPage = Readonly<{
  items: readonly Task[];
  nextCursor: string | null;
  limit: number;
}>;

export interface TaskListFilters {
  readonly isClosed?: boolean;
}

export interface CreateTaskDto {
  readonly type: string;
  readonly assignedUserId: string;
}

/**
 * `expectedStatus` is the optimistic-concurrency precondition: the status the
 * client currently has rendered. A mismatch means the task moved under the
 * client and the request is rejected rather than silently double-applied.
 */
export interface ChangeTaskStatusDto {
  readonly direction: 'forward' | 'backward';
  readonly expectedStatus: number;
  readonly nextAssignedUserId: string;
  readonly customFields?: Readonly<Record<string, unknown>>;
}

export interface TaskHistoryParams {
  readonly limit?: number;
  readonly cursor?: string;
}

/**
 * One recorded transition. `fromStatus: null` marks the task's creation row;
 * `toStatus: null` marks its close — every other row is a status change, with
 * the assignee and the fields submitted for that transition frozen in place.
 */
export interface TaskHistoryEntry {
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly assignedUserId: string;
  readonly fieldsSnapshot: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export type TaskHistoryPage = Readonly<{
  items: readonly TaskHistoryEntry[];
  nextCursor: string | null;
  limit: number;
}>;
