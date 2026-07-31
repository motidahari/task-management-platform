import { useCallback } from 'react';

import { useToast } from '../../../shared/hooks/useToast';
import { useTaskStore } from '../stores/useTaskStore';

export interface AdvanceTaskInput {
  readonly taskId: string;
  readonly expectedStatus: number;
  readonly nextAssignedUserId: string;
  readonly customFields?: Readonly<Record<string, unknown>>;
}

export interface ReverseTaskInput {
  readonly taskId: string;
  readonly expectedStatus: number;
  readonly nextAssignedUserId: string;
}

export interface UseTaskLifecycleResult {
  /** Mirrors the store's `isLoading` — true while an advance/reverse/close request is in flight. */
  readonly isSubmitting: boolean;
  readonly advance: (input: AdvanceTaskInput) => Promise<boolean>;
  readonly reverse: (input: ReverseTaskInput) => Promise<boolean>;
  readonly close: (taskId: string) => Promise<boolean>;
}

/**
 * The one place advance/reverse/close are wired to the store, so
 * `TaskDetailView` and a card's quick actions call the exact same
 * orchestration instead of two copies drifting apart. Every method already
 * gets its boolean-outcome contract from the store (`changeTaskStatus`/
 * `closeTask` set `error`, toast the failure, and — for a stale
 * `expectedStatus` — refetch on their own), so this hook only adds the one
 * thing every successful mutation shares: a confirmation toast. Callers
 * branch on the returned boolean and never see the underlying error; if a
 * caller also needs to navigate on success, that stays its own decision —
 * this hook has no opinion on where a screen goes next.
 */
export function useTaskLifecycle(): UseTaskLifecycleResult {
  const changeTaskStatus = useTaskStore((state) => state.changeTaskStatus);
  const closeTask = useTaskStore((state) => state.closeTask);
  const isSubmitting = useTaskStore((state) => state.isLoading);
  const toast = useToast();

  const advance = useCallback(
    async (input: AdvanceTaskInput): Promise<boolean> => {
      const ok = await changeTaskStatus(input.taskId, {
        direction: 'forward',
        expectedStatus: input.expectedStatus,
        nextAssignedUserId: input.nextAssignedUserId,
        customFields: input.customFields,
      });
      if (ok) toast.success('task-lifecycle.advanced-toast');
      return ok;
    },
    [changeTaskStatus, toast],
  );

  const reverse = useCallback(
    async (input: ReverseTaskInput): Promise<boolean> => {
      const ok = await changeTaskStatus(input.taskId, {
        direction: 'backward',
        expectedStatus: input.expectedStatus,
        nextAssignedUserId: input.nextAssignedUserId,
      });
      if (ok) toast.success('task-lifecycle.reversed-toast');
      return ok;
    },
    [changeTaskStatus, toast],
  );

  const close = useCallback(
    async (taskId: string): Promise<boolean> => {
      const ok = await closeTask(taskId);
      if (ok) toast.success('task-lifecycle.closed-toast');
      return ok;
    },
    [closeTask, toast],
  );

  return { isSubmitting, advance, reverse, close };
}
