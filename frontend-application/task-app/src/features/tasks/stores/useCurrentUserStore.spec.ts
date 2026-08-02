import { ErrorCode } from '@core/shared/error-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '../../../core/types/api-error';
import { userService } from '../services/userService';
import type { UserListPage } from '../services/userService.dto';
import type { User } from '../types';
import { useCurrentUserStore } from './useCurrentUserStore';

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));

vi.mock('../../../core/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('../../../core/bus/bus', () => ({
  bus: { emit: emitMock, on: vi.fn(), off: vi.fn() },
}));

const listUsersMock = vi.spyOn(userService, 'listUsers');

function buildUser(overrides: Partial<User> = {}): User {
  return { id: 'u-1', name: 'Alice', email: 'alice@demo.local', ...overrides };
}

describe('useCurrentUserStore', () => {
  const validationError: ApiError = {
    errorCode: ErrorCode.VALIDATION_ERROR,
    status: 400,
    isNetworkError: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserStore.getState().reset();
  });

  describe('Given:fetching the user list succeeds', () => {
    it('should store the returned users', async () => {
      const user = buildUser();
      const page: UserListPage = { items: [user], nextCursor: null, limit: 20 };
      listUsersMock.mockResolvedValueOnce(page);

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(true);
      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [user],
        isLoading: false,
        error: null,
      });
    });
  });

  describe('Given:fetching the user list fails', () => {
    it('should set the error and emit an error toast', async () => {
      listUsersMock.mockRejectedValueOnce(validationError);

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(false);
      expect(useCurrentUserStore.getState().error).toEqual(validationError);
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.invalid-details',
      });
    });
  });

  describe('Given:reset is called after the store accumulated state', () => {
    it('should restore every field to its initial value', () => {
      useCurrentUserStore.setState({
        users: [buildUser()],
        error: validationError,
      });

      useCurrentUserStore.getState().reset();

      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [],
        isLoading: false,
        error: null,
      });
    });
  });
});
