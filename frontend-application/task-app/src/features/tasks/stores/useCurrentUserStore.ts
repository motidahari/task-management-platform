import { create } from 'zustand';

import { bus } from '../../../core/bus/bus';
import i18n from '../../../core/i18n';
import type { ApiError } from '../../../core/types/api-error';
import { resolveErrorText } from '../../../shared/utils/resolveErrorText';
import { userService } from '../services/userService';
import type { User } from '../types';

export interface CurrentUserStoreState {
  readonly users: readonly User[];
  /** The user `MyTasksView`'s picker currently has selected — `null` before any pick. */
  readonly selectedUserId: string | null;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  fetchUsers: () => Promise<boolean>;
  selectUser: (userId: string) => void;
  reset: () => void;
}

const initialState: Pick<
  CurrentUserStoreState,
  'users' | 'selectedUserId' | 'isLoading' | 'error'
> = {
  users: [],
  selectedUserId: null,
  isLoading: false,
  error: null,
};

/**
 * The picker's backing data plus which user is currently selected — the
 * single source `MyTasksView` reads to know whose tasks to load. Selection
 * never touches the network; only `fetchUsers` does, so switching users is
 * instant and it is the task list's own store that reacts to the change.
 */
export const useCurrentUserStore = create<CurrentUserStoreState>()((set) => ({
  ...initialState,

  fetchUsers: async (): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const page = await userService.listUsers();
      set({ users: page.items });
      return true;
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      set({ error: apiError });
      bus.emit('toast:show', { kind: 'error', text: resolveErrorText(apiError, i18n.t) });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  selectUser: (userId): void => set({ selectedUserId: userId }),

  reset: (): void => set(initialState),
}));
