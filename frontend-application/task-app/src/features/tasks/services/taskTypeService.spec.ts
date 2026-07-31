import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskTypeDefinition } from '../types';
import { TaskTypeService } from './taskTypeService';

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

describe('TaskTypeService', () => {
  let service: TaskTypeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskTypeService();
  });

  describe('Given:a request for the registered task-type definitions', () => {
    it('should GET /task-types and resolve with the response body', async () => {
      const definitions: TaskTypeDefinition[] = [
        {
          type: 'procurement',
          displayName: 'Procurement',
          finalStatus: 3,
          statuses: [{ status: 1, name: 'created', displayName: 'Created', requiredFields: [] }],
        },
      ];
      httpMockInstance.get.mockResolvedValueOnce({ data: definitions });

      const result = await service.getTaskTypes();

      expect(httpMockInstance.get).toHaveBeenCalledWith('/task-types', { params: undefined });
      expect(result).toEqual(definitions);
    });

    it('should propagate a rejected request to the caller', async () => {
      const failure = new Error('network down');
      httpMockInstance.get.mockRejectedValueOnce(failure);

      await expect(service.getTaskTypes()).rejects.toBe(failure);
    });
  });
});
