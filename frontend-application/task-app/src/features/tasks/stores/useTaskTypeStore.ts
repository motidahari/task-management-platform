import { create } from 'zustand';

import type { ApiError } from '../../../core/types/api-error';
import { taskTypeService } from '../services/taskTypeService';
import type { TaskTypeDefinition } from '../types';

export type TaskTypeLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const MAX_LOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface TaskTypeStoreState {
  readonly status: TaskTypeLoadStatus;
  readonly definitions: readonly TaskTypeDefinition[];
  readonly error: ApiError | null;
  loadTaskTypes: () => Promise<void>;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Every dynamic form, stepper, and label in the app derives from this
 * metadata, so a single failed request retries on its own — with a growing
 * pause between attempts — instead of immediately handing the user an error
 * for what is often a transient blip. Only exhausting every attempt reports
 * a definitive failure the user has to act on.
 */
export const useTaskTypeStore = create<TaskTypeStoreState>()((set) => ({
  status: 'idle',
  definitions: [],
  error: null,

  loadTaskTypes: async (): Promise<void> => {
    set({ status: 'loading', error: null });

    for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt += 1) {
      try {
        const definitions = await taskTypeService.getTaskTypes();
        set({ status: 'ready', definitions, error: null });
        return;
      } catch (caughtError) {
        const isLastAttempt = attempt === MAX_LOAD_ATTEMPTS;

        if (isLastAttempt) {
          set({ status: 'error', error: caughtError as ApiError });
          return;
        }

        await wait(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  },
}));
