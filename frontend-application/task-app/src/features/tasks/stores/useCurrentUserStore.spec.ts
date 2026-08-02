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

  describe('Given:fetching the user list succeeds with a single page', () => {
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
      expect(listUsersMock).toHaveBeenCalledTimes(1);
      expect(listUsersMock).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Given:the directory spans multiple pages', () => {
    it('should follow every cursor and accumulate all pages in order', async () => {
      const firstUser = buildUser({ id: 'u-1', name: 'Alice' });
      const secondUser = buildUser({ id: 'u-2', name: 'Bob' });
      const thirdUser = buildUser({ id: 'u-3', name: 'Carol' });
      listUsersMock
        .mockResolvedValueOnce({ items: [firstUser], nextCursor: 'cursor-1', limit: 20 })
        .mockResolvedValueOnce({ items: [secondUser], nextCursor: 'cursor-2', limit: 20 })
        .mockResolvedValueOnce({ items: [thirdUser], nextCursor: null, limit: 20 });

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(true);
      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [firstUser, secondUser, thirdUser],
        isLoading: false,
        error: null,
      });
      expect(listUsersMock).toHaveBeenCalledTimes(3);
      expect(listUsersMock).toHaveBeenNthCalledWith(1, undefined);
      expect(listUsersMock).toHaveBeenNthCalledWith(2, { cursor: 'cursor-1' });
      expect(listUsersMock).toHaveBeenNthCalledWith(3, { cursor: 'cursor-2' });
    });
  });

  describe('Given:fetching the first page fails', () => {
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

  describe('Given:a later page in the cursor walk fails', () => {
    it('should not leave a partial directory and should surface the failure', async () => {
      const firstUser = buildUser({ id: 'u-1', name: 'Alice' });
      listUsersMock
        .mockResolvedValueOnce({ items: [firstUser], nextCursor: 'cursor-1', limit: 20 })
        .mockRejectedValueOnce(validationError);

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(false);
      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [],
        isLoading: false,
        error: validationError,
      });
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.invalid-details',
      });
    });
  });

  describe('Given:the server reissues a cursor it already returned', () => {
    it('should stop walking instead of looping forever, log it, and surface a failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const firstUser = buildUser({ id: 'u-1', name: 'Alice' });
      listUsersMock
        .mockResolvedValueOnce({ items: [firstUser], nextCursor: 'cursor-1', limit: 20 })
        .mockResolvedValueOnce({ items: [firstUser], nextCursor: 'cursor-1', limit: 20 });

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(false);
      expect(listUsersMock).toHaveBeenCalledTimes(2);
      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [],
        isLoading: false,
        error: { errorCode: ErrorCode.INTERNAL_ERROR, status: 500, isNetworkError: false },
      });
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.generic',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('[http] request failed', expect.anything());

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Given:the server never exhausts nextCursor', () => {
    it('should stop at the page cap instead of looping forever and should surface a failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let issuedCursors = 0;
      listUsersMock.mockImplementation(() => {
        issuedCursors += 1;
        return Promise.resolve({ items: [], nextCursor: `cursor-${issuedCursors}`, limit: 20 });
      });

      const result = await useCurrentUserStore.getState().fetchUsers();

      expect(result).toBe(false);
      expect(listUsersMock).toHaveBeenCalledTimes(500);
      expect(useCurrentUserStore.getState()).toMatchObject({
        users: [],
        isLoading: false,
        error: { errorCode: ErrorCode.INTERNAL_ERROR, status: 500, isNetworkError: false },
      });
      expect(emitMock).toHaveBeenCalledWith('toast:show', {
        kind: 'error',
        text: 'shared-errors.generic',
      });

      consoleErrorSpy.mockRestore();
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
