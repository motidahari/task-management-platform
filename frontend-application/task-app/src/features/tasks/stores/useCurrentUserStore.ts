import { create } from 'zustand';

import { bus } from '../../../core/bus/bus';
import i18n from '../../../core/i18n';
import type { ApiError } from '../../../core/types/api-error';
import { resolveErrorText } from '../../../shared/utils/resolveErrorText';
import { userService } from '../services/userService';
import type { User } from '../types';

export interface CurrentUserStoreState {
  readonly users: readonly User[];
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  fetchUsers: () => Promise<boolean>;
  reset: () => void;
}

const initialState: Pick<CurrentUserStoreState, 'users' | 'isLoading' | 'error'> = {
  users: [],
  isLoading: false,
  error: null,
};

/**
 * The seeded-user directory backing every picker in the app. Which user the
 * screen is currently scoped to is a routing concern, not state this store
 * tracks — it lives in the URL (`/users/:userId`) and is read from `useParams`
 * where it's needed, so there is exactly one place that answers "who am I
 * viewing" instead of a route value and a store value that could disagree.
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

  reset: (): void => set(initialState),
}));
