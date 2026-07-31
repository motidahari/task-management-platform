import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../types';
import { UserService } from './userService';
import type { UserListPage } from './userService.dto';

const { httpMockInstance, createMock } = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };

  return { httpMockInstance: instance, createMock: vi.fn(() => instance) };
});

vi.mock('axios', () => ({
  default: { create: createMock },
}));

describe('UserService', () => {
  let service: UserService;

  const user: User = { id: 'u-1', name: 'Alice', email: 'alice@demo.local' };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService();
  });

  describe('Given:a request for the seeded user list with pagination params', () => {
    it('should GET /users with the params and resolve with the page', async () => {
      const page: UserListPage = { items: [user], nextCursor: 'cursor-1', limit: 20 };
      httpMockInstance.get.mockResolvedValueOnce({ data: page });

      const result = await service.listUsers({ limit: 20, cursor: 'cursor-0' });

      expect(httpMockInstance.get).toHaveBeenCalledWith('/users', {
        params: { limit: 20, cursor: 'cursor-0' },
      });
      expect(result).toEqual(page);
    });
  });

  describe('Given:no params', () => {
    it('should GET /users with no query params', async () => {
      const page: UserListPage = { items: [user], nextCursor: null, limit: 20 };
      httpMockInstance.get.mockResolvedValueOnce({ data: page });

      const result = await service.listUsers();

      expect(httpMockInstance.get).toHaveBeenCalledWith('/users', { params: undefined });
      expect(result).toEqual(page);
    });
  });

  describe('Given:the request rejects', () => {
    it('should propagate the rejection to the caller', async () => {
      const failure = new Error('network down');
      httpMockInstance.get.mockRejectedValueOnce(failure);

      await expect(service.listUsers()).rejects.toBe(failure);
    });
  });
});
