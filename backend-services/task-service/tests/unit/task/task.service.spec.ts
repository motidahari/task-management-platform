import type { DataSource, EntityManager } from 'typeorm';

import { TaskStatusHistoryWriteDao } from '../../../src/task/dao/task-status-history-write.dao';
import { TaskWriteDao } from '../../../src/task/dao/task-write.dao';
import { Task } from '../../../src/domain/task.model';
import { TaskTypeRegistry } from '../../../src/task-type/task-type.registry';
import { AssigneeNotFoundException } from '../../../src/task/exception/assignee-not-found.exception';
import { UnknownTaskTypeException } from '../../../src/task/exception/unknown-task-type.exception';
import { TaskService } from '../../../src/task/task.service';

const ASSIGNEE_ID = '11111111-1111-1111-1111-111111111111';
const TRANSACTION_MANAGER = {} as EntityManager;

function fakeTask(
  overrides: Partial<{ id: string; assignedUserId: string; status: number }> = {},
): Task {
  return new Task({
    id: overrides.id ?? 'task-id',
    type: 'procurement',
    status: overrides.status ?? 1,
    isClosed: false,
    assignedUserId: overrides.assignedUserId ?? ASSIGNEE_ID,
    customFields: {},
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

/**
 * Mirrors `DataSource.transaction`'s real contract closely enough for a unit
 * test: it runs the callback against a fixed manager and, crucially, does
 * not swallow a rejection — the same thing a real transaction relies on to
 * know it must roll back rather than commit. Kept as a standalone mock
 * (rather than read back off `dataSource.transaction`) so assertions target
 * a plain jest mock, not a property access typed as a class method.
 */
function fakeDataSource(transactionMock: jest.Mock): DataSource {
  return { transaction: transactionMock } as unknown as DataSource;
}

interface TaskServiceHarness {
  service: TaskService;
  transactionMock: jest.Mock;
  taskDao: { create: jest.Mock };
  taskStatusHistoryDao: { appendCreation: jest.Mock };
  assigneeExistenceDao: { existsById: jest.Mock };
  taskTypeRegistry: { findByType: jest.Mock };
}

function taskServiceHarness(
  overrides: Partial<{
    taskDao: { create: jest.Mock };
    taskStatusHistoryDao: { appendCreation: jest.Mock };
    assigneeExistenceDao: { existsById: jest.Mock };
    taskTypeRegistry: { findByType: jest.Mock };
  }> = {},
): TaskServiceHarness {
  const transactionMock = jest.fn(
    (runInTransaction: (manager: EntityManager) => Promise<unknown>) =>
      runInTransaction(TRANSACTION_MANAGER),
  );
  const taskDao = overrides.taskDao ?? { create: jest.fn().mockResolvedValue(fakeTask()) };
  const taskStatusHistoryDao = overrides.taskStatusHistoryDao ?? {
    appendCreation: jest.fn().mockResolvedValue(undefined),
  };
  const assigneeExistenceDao = overrides.assigneeExistenceDao ?? {
    existsById: jest.fn().mockResolvedValue(true),
  };
  const taskTypeRegistry = overrides.taskTypeRegistry ?? {
    findByType: jest.fn().mockReturnValue({ type: 'procurement' }),
  };

  const service = new TaskService(
    fakeDataSource(transactionMock),
    taskDao as unknown as TaskWriteDao,
    taskStatusHistoryDao as unknown as TaskStatusHistoryWriteDao,
    assigneeExistenceDao,
    taskTypeRegistry as unknown as TaskTypeRegistry,
  );

  return {
    service,
    transactionMock,
    taskDao,
    taskStatusHistoryDao,
    assigneeExistenceDao,
    taskTypeRegistry,
  };
}

describe('TaskService', () => {
  describe('Given:a registered task type and an existing assignee, When:createTask is called', () => {
    it('should return the inserted task', async () => {
      const insertedTask = fakeTask({ id: 'new-task-id', status: 1 });
      const { service } = taskServiceHarness({
        taskDao: { create: jest.fn().mockResolvedValue(insertedTask) },
      });

      const result = await service.createTask({ type: 'procurement', assignedUserId: ASSIGNEE_ID });

      expect(result).toBe(insertedTask);
    });

    it('should insert the task and append its creation history row inside one transaction', async () => {
      const insertedTask = fakeTask({ id: 'new-task-id', status: 1 });
      const { service, transactionMock, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: { create: jest.fn().mockResolvedValue(insertedTask) },
      });

      await service.createTask({ type: 'procurement', assignedUserId: ASSIGNEE_ID });

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(taskDao.create).toHaveBeenCalledWith(
        { type: 'procurement', assignedUserId: ASSIGNEE_ID },
        TRANSACTION_MANAGER,
      );
      // The service hands the DAO the whole task and nothing else — it does
      // not know (or assemble) the history row's field layout; that is the
      // DAO's job in `appendCreation`.
      expect(taskStatusHistoryDao.appendCreation).toHaveBeenCalledWith(
        insertedTask,
        TRANSACTION_MANAGER,
      );
    });
  });

  describe('Given:a type the registry does not recognize, When:createTask is called', () => {
    it('should reject with UnknownTaskTypeException and write nothing', async () => {
      const { service, taskDao, taskStatusHistoryDao, assigneeExistenceDao } = taskServiceHarness({
        taskTypeRegistry: { findByType: jest.fn().mockReturnValue(null) },
      });

      await expect(
        service.createTask({ type: 'not-a-real-type', assignedUserId: ASSIGNEE_ID }),
      ).rejects.toThrow(UnknownTaskTypeException);

      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.create).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.appendCreation).not.toHaveBeenCalled();
    });
  });

  describe('Given:an assignedUserId with no matching user row, When:createTask is called', () => {
    it('should reject with AssigneeNotFoundException and write nothing', async () => {
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        assigneeExistenceDao: { existsById: jest.fn().mockResolvedValue(false) },
      });

      await expect(
        service.createTask({ type: 'procurement', assignedUserId: ASSIGNEE_ID }),
      ).rejects.toThrow(AssigneeNotFoundException);

      expect(taskDao.create).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.appendCreation).not.toHaveBeenCalled();
    });
  });

  describe('Given:the history append fails after the task row was inserted, When:createTask is called', () => {
    it('should propagate the failure out of the transaction rather than returning a task', async () => {
      const failure = new Error('constraint violation');
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskStatusHistoryDao: { appendCreation: jest.fn().mockRejectedValue(failure) },
      });

      await expect(
        service.createTask({ type: 'procurement', assignedUserId: ASSIGNEE_ID }),
      ).rejects.toThrow(failure);

      // Both writes were attempted against the same transaction manager —
      // the point of the explicit transaction is that a real one rolls
      // both back together on this same unmodified rejection, leaving
      // neither row committed, rather than the service catching it and
      // leaving the task row stranded without its history entry.
      expect(taskDao.create).toHaveBeenCalledTimes(1);
      expect(taskStatusHistoryDao.appendCreation).toHaveBeenCalledTimes(1);
    });
  });
});
