import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChangeTaskStatusDto, CreateTaskDto, Task, TaskListPage } from '../types';
import { TaskService } from './taskService';

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

describe('TaskService', () => {
  let service: TaskService;

  const task: Task = {
    id: 't-1',
    type: 'development',
    status: 1,
    statusName: 'created',
    isClosed: false,
    assignedUserId: 'u-1',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskService();
  });

  describe('Given:a request for one user’s tasks', () => {
    it('should GET /users/:id/tasks with the pagination params and resolve with the page', async () => {
      const page: TaskListPage = { items: [task], nextCursor: 'cursor-1', limit: 20 };
      httpMockInstance.get.mockResolvedValueOnce({ data: page });

      const result = await service.listTasksForUser('u-1', { isClosed: false, cursor: 'cursor-0' });

      expect(httpMockInstance.get).toHaveBeenCalledWith('/users/u-1/tasks', {
        params: { isClosed: false, cursor: 'cursor-0' },
      });
      expect(result).toEqual(page);
    });
  });

  describe('Given:a request for one task by id', () => {
    it('should GET /tasks/:id and resolve with the task', async () => {
      httpMockInstance.get.mockResolvedValueOnce({ data: task });

      const result = await service.getTask('t-1');

      expect(httpMockInstance.get).toHaveBeenCalledWith('/tasks/t-1', { params: undefined });
      expect(result).toEqual(task);
    });
  });

  describe('Given:a request to create a task', () => {
    it('should POST /tasks with the dto and resolve with the created task', async () => {
      const dto: CreateTaskDto = { type: 'development', assignedUserId: 'u-1' };
      httpMockInstance.post.mockResolvedValueOnce({ data: task });

      const result = await service.createTask(dto);

      expect(httpMockInstance.post).toHaveBeenCalledWith('/tasks', dto);
      expect(result).toEqual(task);
    });
  });

  describe('Given:a request to change a task’s status', () => {
    it('should PATCH /tasks/:id/status with the expectedStatus precondition and resolve with the updated task', async () => {
      const dto: ChangeTaskStatusDto = {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: 'u-2',
        customFields: { branchName: 'feature/login' },
      };
      const updatedTask: Task = { ...task, status: 2, statusName: 'in-progress' };
      httpMockInstance.patch.mockResolvedValueOnce({ data: updatedTask });

      const result = await service.changeTaskStatus('t-1', dto);

      expect(httpMockInstance.patch).toHaveBeenCalledWith('/tasks/t-1/status', dto);
      expect(result).toEqual(updatedTask);
    });
  });

  describe('Given:a request to close a task', () => {
    it('should POST /tasks/:id/close with no body and resolve with the closed task', async () => {
      const closedTask: Task = { ...task, isClosed: true };
      httpMockInstance.post.mockResolvedValueOnce({ data: closedTask });

      const result = await service.closeTask('t-1');

      expect(httpMockInstance.post).toHaveBeenCalledWith('/tasks/t-1/close', undefined);
      expect(result).toEqual(closedTask);
    });
  });

  describe('Given:the request rejects', () => {
    it('should propagate the rejection to the caller', async () => {
      const failure = new Error('network down');
      httpMockInstance.get.mockRejectedValueOnce(failure);

      await expect(service.getTask('t-1')).rejects.toBe(failure);
    });
  });
});
