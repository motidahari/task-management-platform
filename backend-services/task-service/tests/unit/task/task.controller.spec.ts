import { Task } from '../../../src/domain/task.model';
import { ChangeStatusDto } from '../../../src/task/dto/change-status.dto';
import { CreateTaskDto } from '../../../src/task/dto/create-task.dto';
import type { HistoryPageDto } from '../../../src/task/dto/history-page.dto';
import { TaskController } from '../../../src/task/task.controller';
import type { TaskService } from '../../../src/task/task.service';
import type { TaskTypeRegistry } from '../../../src/task-type/task-type.registry';

const TASK_ID = '11111111-1111-1111-1111-111111111111';
const ASSIGNEE_ID = '22222222-2222-2222-2222-222222222222';

function fakeTask(overrides: Partial<{ status: number; type: string }> = {}): Task {
  return new Task({
    id: TASK_ID,
    type: overrides.type ?? 'procurement',
    status: overrides.status ?? 2,
    isClosed: false,
    assignedUserId: ASSIGNEE_ID,
    customFields: { quote1: '100 USD' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: '2026-01-01T00:00:00.123456Z',
  });
}

interface TaskServiceMock {
  createTask: jest.Mock;
  getById: jest.Mock;
  changeStatus: jest.Mock;
  closeTask: jest.Mock;
  getHistoryPage: jest.Mock;
}

function controllerWith(
  taskServiceOverrides: Partial<TaskServiceMock> = {},
  statusNameOf: jest.Mock = jest.fn().mockReturnValue('supplier-offers-received'),
): { controller: TaskController; taskService: TaskServiceMock; statusNameOf: jest.Mock } {
  const taskService: TaskServiceMock = {
    createTask: jest.fn().mockResolvedValue(fakeTask()),
    getById: jest.fn().mockResolvedValue(fakeTask()),
    changeStatus: jest.fn().mockResolvedValue(fakeTask()),
    closeTask: jest.fn().mockResolvedValue(fakeTask({ status: 3 })),
    getHistoryPage: jest.fn(),
    ...taskServiceOverrides,
  };
  const taskTypeRegistry = { statusNameOf } as unknown as TaskTypeRegistry;
  const controller = new TaskController(taskService as unknown as TaskService, taskTypeRegistry);

  return { controller, taskService, statusNameOf };
}

const EXPECTED_WIRE_TASK = {
  id: TASK_ID,
  type: 'procurement',
  status: 2,
  statusName: 'supplier-offers-received',
  isClosed: false,
  assignedUserId: ASSIGNEE_ID,
  customFields: { quote1: '100 USD' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: '2026-01-01T00:00:00.123456Z',
};

describe('TaskController', () => {
  describe('Given:a valid create request, When:create is called', () => {
    it('should delegate to TaskService.createTask and return the wire shape with the resolved status name', async () => {
      const { controller, taskService, statusNameOf } = controllerWith();
      const dto: CreateTaskDto = { type: 'procurement', assignedUserId: ASSIGNEE_ID };

      const result = await controller.create(dto);

      expect(taskService.createTask).toHaveBeenCalledWith(dto);
      expect(statusNameOf).toHaveBeenCalledWith('procurement', 2);
      expect(result).toEqual(EXPECTED_WIRE_TASK);
    });
  });

  describe('Given:an existing task id, When:getById is called', () => {
    it('should delegate to TaskService.getById and return the wire shape', async () => {
      const { controller, taskService } = controllerWith();

      const result = await controller.getById(TASK_ID);

      expect(taskService.getById).toHaveBeenCalledWith(TASK_ID);
      expect(result).toEqual(EXPECTED_WIRE_TASK);
    });
  });

  describe('Given:a valid status-change request, When:changeStatus is called', () => {
    it('should delegate to TaskService.changeStatus and return the wire shape', async () => {
      const { controller, taskService } = controllerWith();
      const dto: ChangeStatusDto = {
        direction: 'forward',
        expectedStatus: 1,
        nextAssignedUserId: ASSIGNEE_ID,
        customFields: { branchName: 'feature/login' },
      };

      const result = await controller.changeStatus(TASK_ID, dto);

      expect(taskService.changeStatus).toHaveBeenCalledWith(TASK_ID, dto);
      expect(result).toEqual(EXPECTED_WIRE_TASK);
    });
  });

  describe('Given:a task at its final status, When:close is called', () => {
    it('should delegate to TaskService.closeTask and return the wire shape', async () => {
      const { controller, taskService, statusNameOf } = controllerWith();

      const result = await controller.close(TASK_ID);

      expect(taskService.closeTask).toHaveBeenCalledWith(TASK_ID);
      expect(statusNameOf).toHaveBeenCalledWith('procurement', 3);
      expect(result).toEqual({ ...EXPECTED_WIRE_TASK, status: 3, isClosed: false });
    });
  });

  describe('Given:a history page request, When:getHistory is called', () => {
    it('should delegate straight to TaskService.getHistoryPage without reshaping the result', async () => {
      const historyPage: HistoryPageDto = { items: [], nextCursor: null, limit: 20 };
      const { controller, taskService } = controllerWith({
        getHistoryPage: jest.fn().mockResolvedValue(historyPage),
      });

      const result = controller.getHistory(TASK_ID, { limit: 20 });

      expect(taskService.getHistoryPage).toHaveBeenCalledWith(TASK_ID, { limit: 20 });
      await expect(result).resolves.toBe(historyPage);
    });
  });
});
