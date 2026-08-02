import { create } from 'zustand';

import { bus } from '../../../core/bus/bus';
import i18n from '../../../core/i18n';
import { toInternalClientApiError } from '../../../core/services/BaseHttpService';
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

// However large the seeded directory legitimately grows, it stays orders of
// magnitude below this — the cap exists only to bound a server bug that
// mints an endless stream of distinct cursors, mirroring `MAX_LOAD_ATTEMPTS`
// in `useTaskTypeStore`: a fixed ceiling on retries against a misbehaving
// dependency, not a limit anything real is expected to reach.
const MAX_DIRECTORY_PAGES = 500;

/**
 * Unlike the task list, the seeded directory backing the picker and every
 * assignee field has to be reachable in full — a truncated directory would
 * make some assignee simply unpickable. So this walks `nextCursor` until the
 * server reports none left, accumulating every page in order. Two server
 * bugs could otherwise hang the walk forever, so both fail it instead: the
 * same `nextCursor` coming back twice (a cycle, any length), and the page
 * count outrunning `MAX_DIRECTORY_PAGES` (an endless stream of distinct
 * cursors). Either way the walk rejects with `toInternalClientApiError`
 * rather than returning a directory that silently stops partway.
 */
async function fetchAllUsers(): Promise<readonly User[]> {
  let users: readonly User[] = [];
  const consumedCursors = new Set<string>();
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    if (pageCount >= MAX_DIRECTORY_PAGES) {
      // ApiError is the typed contract every store's catch expects — the
      // same reasoning BaseHttpService's interceptor rejects with one
      // directly for, rather than wrapping it in an `Error`.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(
        toInternalClientApiError(
          new Error(`user directory cursor walk exceeded ${MAX_DIRECTORY_PAGES} pages`),
        ),
      );
    }

    const page = await userService.listUsers(cursor ? { cursor } : undefined);
    users = [...users, ...page.items];
    pageCount += 1;

    if (page.nextCursor !== null) {
      if (consumedCursors.has(page.nextCursor)) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(
          toInternalClientApiError(
            new Error('user directory cursor walk received an already-consumed cursor'),
          ),
        );
      }
      consumedCursors.add(page.nextCursor);
    }

    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  return users;
}

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
      const users = await fetchAllUsers();
      set({ users });
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
