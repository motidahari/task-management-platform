import type { DataSource, EntityManager } from 'typeorm';

import type { TaskStatusHistoryEntry } from '../../../src/domain/task-status-history.dao';
import { TaskStatusHistoryWriteDao } from '../../../src/task/dao/task-status-history-write.dao';
import { TaskWriteDao } from '../../../src/task/dao/task-write.dao';
import { Task } from '../../../src/domain/task.model';
import type { StatusDefinition } from '../../../src/task-type/interfaces/task-type-definition.interface';
import { TaskTypeRegistry } from '../../../src/task-type/task-type.registry';
import type { ChangeStatusDto } from '../../../src/task/dto/change-status.dto';
import type { HistoryEntryDto } from '../../../src/task/dto/history-page.dto';
import { AssigneeNotFoundException } from '../../../src/task/exception/assignee-not-found.exception';
import { InvalidStatusTransitionException } from '../../../src/task/exception/invalid-status-transition.exception';
import { MissingRequiredFieldsException } from '../../../src/task/exception/missing-required-fields.exception';
import { TaskClosedException } from '../../../src/task/exception/task-closed.exception';
import { TaskNotAtFinalStatusException } from '../../../src/task/exception/task-not-at-final-status.exception';
import { TaskNotFoundException } from '../../../src/task/exception/task-not-found.exception';
import { TaskStateConflictException } from '../../../src/task/exception/task-state-conflict.exception';
import { UnknownTaskTypeException } from '../../../src/task/exception/unknown-task-type.exception';
import { TaskService } from '../../../src/task/task.service';

const ASSIGNEE_ID = '11111111-1111-1111-1111-111111111111';
const NEXT_ASSIGNEE_ID = '22222222-2222-2222-2222-222222222222';
const TRANSACTION_MANAGER = {} as EntityManager;

/**
 * A three-status type: status 1 is where every task starts, status 3 is the
 * final status `resolveTargetStatus` must reject moving past. Real field
 * descriptors are irrelevant here — `fieldValidator` is mocked directly in
 * every test that would otherwise reach it, never exercised for real.
 */
const PROCUREMENT_STATUSES: readonly StatusDefinition[] = [
  { status: 1, name: 'requested', displayName: 'Requested', requiredFields: [] },
  { status: 2, name: 'quoted', displayName: 'Quoted', requiredFields: [] },
  { status: 3, name: 'approved', displayName: 'Approved', requiredFields: [] },
];

function fakeTask(
  overrides: Partial<{
    id: string;
    type: string;
    status: number;
    isClosed: boolean;
    assignedUserId: string;
    customFields: Record<string, unknown>;
  }> = {},
): Task {
  return new Task({
    id: overrides.id ?? 'task-id',
    type: overrides.type ?? 'procurement',
    status: overrides.status ?? 1,
    isClosed: overrides.isClosed ?? false,
    assignedUserId: overrides.assignedUserId ?? ASSIGNEE_ID,
    customFields: overrides.customFields ?? {},
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: '2026-01-01T00:00:00.000000Z',
  });
}

function changeStatusDto(overrides: Partial<ChangeStatusDto> = {}): ChangeStatusDto {
  return {
    direction: overrides.direction ?? 'forward',
    expectedStatus: overrides.expectedStatus ?? 1,
    nextAssignedUserId: overrides.nextAssignedUserId ?? NEXT_ASSIGNEE_ID,
    customFields: overrides.customFields,
  };
}

function fakeHistoryEntry(overrides: Partial<TaskStatusHistoryEntry> = {}): TaskStatusHistoryEntry {
  return {
    id: overrides.id ?? 'history-id',
    taskId: overrides.taskId ?? 'task-id',
    fromStatus: overrides.fromStatus ?? null,
    toStatus: overrides.toStatus ?? 1,
    assignedUserId: overrides.assignedUserId ?? ASSIGNEE_ID,
    fieldsSnapshot: overrides.fieldsSnapshot ?? {},
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
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

interface TaskDaoMock {
  create: jest.Mock;
  getByIdForUpdate: jest.Mock;
  update: jest.Mock;
  getById: jest.Mock;
  getByIdOnPrimary: jest.Mock;
  findPageByAssignee: jest.Mock;
  close: jest.Mock;
}

interface TaskStatusHistoryDaoMock {
  appendCreation: jest.Mock;
  append: jest.Mock;
  findPageByTask: jest.Mock;
  appendClose: jest.Mock;
}

interface TaskServiceHarness {
  service: TaskService;
  transactionMock: jest.Mock;
  taskDao: TaskDaoMock;
  taskStatusHistoryDao: TaskStatusHistoryDaoMock;
  assigneeExistenceDao: { existsById: jest.Mock };
  taskTypeRegistry: { findByType: jest.Mock; finalStatusOf: jest.Mock; statusNameOf: jest.Mock };
  fieldValidator: { validate: jest.Mock };
}

function defaultTaskDaoMock(): TaskDaoMock {
  return {
    create: jest.fn().mockResolvedValue(fakeTask()),
    getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask()),
    update: jest
      .fn()
      .mockImplementation(
        (
          taskId: string,
          params: { status: number; assignedUserId: string; customFields: Record<string, unknown> },
        ) =>
          fakeTask({
            id: taskId,
            status: params.status,
            assignedUserId: params.assignedUserId,
            customFields: params.customFields,
          }),
      ),
    getById: jest.fn().mockResolvedValue(fakeTask()),
    getByIdOnPrimary: jest.fn().mockResolvedValue(fakeTask()),
    findPageByAssignee: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    close: jest
      .fn()
      .mockImplementation((taskId: string) => fakeTask({ id: taskId, isClosed: true })),
  };
}

function defaultTaskStatusHistoryDaoMock(): TaskStatusHistoryDaoMock {
  return {
    appendCreation: jest.fn().mockResolvedValue(undefined),
    append: jest.fn().mockResolvedValue(undefined),
    findPageByTask: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    appendClose: jest.fn().mockResolvedValue(undefined),
  };
}

function taskServiceHarness(
  overrides: Partial<{
    taskDao: Partial<TaskDaoMock>;
    taskStatusHistoryDao: Partial<TaskStatusHistoryDaoMock>;
    assigneeExistenceDao: { existsById: jest.Mock };
    taskTypeRegistry: { findByType: jest.Mock; finalStatusOf: jest.Mock; statusNameOf: jest.Mock };
    fieldValidator: { validate: jest.Mock };
  }> = {},
): TaskServiceHarness {
  const transactionMock = jest.fn(
    (runInTransaction: (manager: EntityManager) => Promise<unknown>) =>
      runInTransaction(TRANSACTION_MANAGER),
  );
  // A caller overriding only the methods its own test exercises (e.g. just
  // `getByIdForUpdate`) still gets every other method as a harmless default
  // mock, rather than having to restate the whole DAO shape at every call site.
  const taskDao: TaskDaoMock = { ...defaultTaskDaoMock(), ...overrides.taskDao };
  const taskStatusHistoryDao: TaskStatusHistoryDaoMock = {
    ...defaultTaskStatusHistoryDaoMock(),
    ...overrides.taskStatusHistoryDao,
  };
  const assigneeExistenceDao = overrides.assigneeExistenceDao ?? {
    existsById: jest.fn().mockResolvedValue(true),
  };
  const taskTypeRegistry = overrides.taskTypeRegistry ?? {
    findByType: jest.fn().mockReturnValue({ type: 'procurement', statuses: PROCUREMENT_STATUSES }),
    finalStatusOf: jest.fn().mockReturnValue(3),
    statusNameOf: jest.fn().mockReturnValue('requested'),
  };
  const fieldValidator = overrides.fieldValidator ?? {
    validate: jest.fn().mockReturnValue({ valid: true, sanitizedFields: {} }),
  };

  const service = new TaskService(
    fakeDataSource(transactionMock),
    taskDao as unknown as TaskWriteDao,
    taskStatusHistoryDao as unknown as TaskStatusHistoryWriteDao,
    assigneeExistenceDao,
    taskTypeRegistry as unknown as TaskTypeRegistry,
    fieldValidator,
  );

  return {
    service,
    transactionMock,
    taskDao,
    taskStatusHistoryDao,
    assigneeExistenceDao,
    taskTypeRegistry,
    fieldValidator,
  };
}

describe('TaskService', () => {
  describe('Given:a registered task type and an existing assignee, When:createTask is called', () => {
    it('should return the inserted task', async () => {
      const insertedTask = fakeTask({ id: 'new-task-id', status: 1 });
      const { service } = taskServiceHarness({
        taskDao: {
          create: jest.fn().mockResolvedValue(insertedTask),
          getByIdForUpdate: jest.fn(),
          update: jest.fn(),
        },
      });

      const result = await service.createTask({ type: 'procurement', assignedUserId: ASSIGNEE_ID });

      expect(result).toBe(insertedTask);
    });

    it('should insert the task and append its creation history row inside one transaction', async () => {
      const insertedTask = fakeTask({ id: 'new-task-id', status: 1 });
      const { service, transactionMock, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn().mockResolvedValue(insertedTask),
          getByIdForUpdate: jest.fn(),
          update: jest.fn(),
        },
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
        taskTypeRegistry: {
          findByType: jest.fn().mockReturnValue(null),
          finalStatusOf: jest.fn(),
          statusNameOf: jest.fn(),
        },
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
        taskStatusHistoryDao: {
          appendCreation: jest.fn().mockRejectedValue(failure),
          append: jest.fn(),
        },
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

  describe('Given:no task exists for the id, When:changeStatus is called', () => {
    it('should reject with TaskNotFoundException and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockRejectedValue(new TaskNotFoundException('missing-task')),
          update: jest.fn(),
        },
      });

      await expect(service.changeStatus('missing-task', changeStatusDto())).rejects.toThrow(
        TaskNotFoundException,
      );

      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:the task is already closed, When:changeStatus is called', () => {
    it('should reject with TaskClosedException and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ isClosed: true })),
          update: jest.fn(),
        },
      });

      await expect(service.changeStatus('task-id', changeStatusDto())).rejects.toThrow(
        TaskClosedException,
      );

      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe("Given:the caller's expectedStatus no longer matches the task's current status, When:changeStatus is called", () => {
    it('should reject with TaskStateConflictException carrying the current status and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 2 })),
          update: jest.fn(),
        },
      });

      // A stale client (or a duplicate submit of the same request) still
      // believes the task is at status 1 — the real row has already moved on.
      const request = changeStatusDto({ expectedStatus: 1 });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        TaskStateConflictException,
      );
      await expect(service.changeStatus('task-id', request)).rejects.toMatchObject({
        details: { currentStatus: 2 },
      });

      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe("Given:a forward move already at the task type's final status, When:changeStatus is called", () => {
    it('should reject with InvalidStatusTransitionException and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao, fieldValidator } =
        taskServiceHarness({
          taskDao: {
            create: jest.fn(),
            getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 3 })),
            update: jest.fn(),
          },
        });

      const request = changeStatusDto({ direction: 'forward', expectedStatus: 3 });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        InvalidStatusTransitionException,
      );

      expect(fieldValidator.validate).not.toHaveBeenCalled();
      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:a backward move at status 1, When:changeStatus is called', () => {
    it('should reject with InvalidStatusTransitionException and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao, fieldValidator } =
        taskServiceHarness({
          taskDao: {
            create: jest.fn(),
            getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 1 })),
            update: jest.fn(),
          },
        });

      const request = changeStatusDto({ direction: 'backward', expectedStatus: 1 });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        InvalidStatusTransitionException,
      );

      expect(fieldValidator.validate).not.toHaveBeenCalled();
      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:a forward move missing a required field, When:changeStatus is called', () => {
    it('should reject with MissingRequiredFieldsException and write nothing', async () => {
      const { service, taskDao, assigneeExistenceDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 1 })),
          update: jest.fn(),
        },
        fieldValidator: {
          validate: jest
            .fn()
            .mockReturnValue({ valid: false, missing: ['branchName'], invalid: {} }),
        },
      });

      const request = changeStatusDto({
        direction: 'forward',
        expectedStatus: 1,
        customFields: {},
      });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        MissingRequiredFieldsException,
      );

      expect(assigneeExistenceDao.existsById).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:the next assignee does not exist, When:changeStatus is called forward', () => {
    it('should reject with AssigneeNotFoundException and write nothing', async () => {
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 1 })),
          update: jest.fn(),
        },
        assigneeExistenceDao: { existsById: jest.fn().mockResolvedValue(false) },
      });

      const request = changeStatusDto({ direction: 'forward', expectedStatus: 1 });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        AssigneeNotFoundException,
      );

      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:the next assignee does not exist, When:changeStatus is called backward', () => {
    it('should reject with AssigneeNotFoundException even though backward ignores customFields', async () => {
      const { service, taskDao, taskStatusHistoryDao, fieldValidator } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 2 })),
          update: jest.fn(),
        },
        assigneeExistenceDao: { existsById: jest.fn().mockResolvedValue(false) },
      });

      const request = changeStatusDto({ direction: 'backward', expectedStatus: 2 });

      await expect(service.changeStatus('task-id', request)).rejects.toThrow(
        AssigneeNotFoundException,
      );

      expect(fieldValidator.validate).not.toHaveBeenCalled();
      expect(taskDao.update).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.append).not.toHaveBeenCalled();
    });
  });

  describe('Given:a valid forward move, When:changeStatus is called', () => {
    it('should return the task with fields merged onto its existing custom fields', async () => {
      const { service } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest
            .fn()
            .mockResolvedValue(
              fakeTask({ id: 'task-id', status: 1, customFields: { existing: 'x' } }),
            ),
          update: jest.fn().mockImplementation(
            (
              taskId: string,
              params: {
                status: number;
                assignedUserId: string;
                customFields: Record<string, unknown>;
              },
            ) => fakeTask({ id: taskId, ...params }),
          ),
        },
        fieldValidator: {
          validate: jest
            .fn()
            .mockReturnValue({ valid: true, sanitizedFields: { branchName: 'main' } }),
        },
      });

      const request = changeStatusDto({
        direction: 'forward',
        expectedStatus: 1,
        customFields: { branchName: 'feature/login' },
      });

      const result = await service.changeStatus('task-id', request);

      expect(result.status).toBe(2);
      expect(result.assignedUserId).toBe(NEXT_ASSIGNEE_ID);
      expect(result.customFields).toEqual({ existing: 'x', branchName: 'main' });
    });

    it('should validate against the target status, update the row once and append a history row inside one transaction', async () => {
      const { service, transactionMock, taskDao, taskStatusHistoryDao, fieldValidator } =
        taskServiceHarness({
          taskDao: {
            create: jest.fn(),
            getByIdForUpdate: jest
              .fn()
              .mockResolvedValue(
                fakeTask({ id: 'task-id', status: 1, customFields: { existing: 'x' } }),
              ),
            update: jest.fn().mockImplementation(
              (
                taskId: string,
                params: {
                  status: number;
                  assignedUserId: string;
                  customFields: Record<string, unknown>;
                },
              ) => fakeTask({ id: taskId, ...params }),
            ),
          },
          fieldValidator: {
            validate: jest
              .fn()
              .mockReturnValue({ valid: true, sanitizedFields: { branchName: 'main' } }),
          },
        });

      const request = changeStatusDto({
        direction: 'forward',
        expectedStatus: 1,
        customFields: { branchName: 'feature/login' },
      });

      await service.changeStatus('task-id', request);

      expect(transactionMock).toHaveBeenCalledTimes(1);
      // Validated against status 2's definition — the target of the move,
      // not the task's current status.
      expect(fieldValidator.validate).toHaveBeenCalledWith(
        { branchName: 'feature/login' },
        PROCUREMENT_STATUSES[1],
      );
      expect(taskDao.update).toHaveBeenCalledWith(
        'task-id',
        {
          status: 2,
          assignedUserId: NEXT_ASSIGNEE_ID,
          customFields: { existing: 'x', branchName: 'main' },
        },
        TRANSACTION_MANAGER,
      );
      expect(taskStatusHistoryDao.append).toHaveBeenCalledWith(
        {
          taskId: 'task-id',
          fromStatus: 1,
          toStatus: 2,
          assignedUserId: NEXT_ASSIGNEE_ID,
          fieldsSnapshot: { branchName: 'main' },
        },
        TRANSACTION_MANAGER,
      );
    });
  });

  describe('Given:a valid backward move, When:changeStatus is called', () => {
    it("should return the task with its custom fields unchanged, ignoring the request's customFields", async () => {
      const { service } = taskServiceHarness({
        taskDao: {
          create: jest.fn(),
          getByIdForUpdate: jest
            .fn()
            .mockResolvedValue(
              fakeTask({ id: 'task-id', status: 2, customFields: { existing: 'x' } }),
            ),
          update: jest.fn().mockImplementation(
            (
              taskId: string,
              params: {
                status: number;
                assignedUserId: string;
                customFields: Record<string, unknown>;
              },
            ) => fakeTask({ id: taskId, ...params }),
          ),
        },
      });

      const request = changeStatusDto({
        direction: 'backward',
        expectedStatus: 2,
        customFields: { ignoredField: 'should never reach validation or storage' },
      });

      const result = await service.changeStatus('task-id', request);

      expect(result.status).toBe(1);
      expect(result.customFields).toEqual({ existing: 'x' });
    });

    it('should skip field validation, update the row once and append a history row with an empty fields snapshot', async () => {
      const { service, transactionMock, taskDao, taskStatusHistoryDao, fieldValidator } =
        taskServiceHarness({
          taskDao: {
            create: jest.fn(),
            getByIdForUpdate: jest
              .fn()
              .mockResolvedValue(
                fakeTask({ id: 'task-id', status: 2, customFields: { existing: 'x' } }),
              ),
            update: jest.fn().mockImplementation(
              (
                taskId: string,
                params: {
                  status: number;
                  assignedUserId: string;
                  customFields: Record<string, unknown>;
                },
              ) => fakeTask({ id: taskId, ...params }),
            ),
          },
        });

      const request = changeStatusDto({ direction: 'backward', expectedStatus: 2 });

      await service.changeStatus('task-id', request);

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(fieldValidator.validate).not.toHaveBeenCalled();
      expect(taskDao.update).toHaveBeenCalledWith(
        'task-id',
        { status: 1, assignedUserId: NEXT_ASSIGNEE_ID, customFields: { existing: 'x' } },
        TRANSACTION_MANAGER,
      );
      expect(taskStatusHistoryDao.append).toHaveBeenCalledWith(
        {
          taskId: 'task-id',
          fromStatus: 2,
          toStatus: 1,
          assignedUserId: NEXT_ASSIGNEE_ID,
          fieldsSnapshot: {},
        },
        TRANSACTION_MANAGER,
      );
    });
  });

  describe('Given:no task exists for the id, When:getHistoryPage is called', () => {
    it('should reject with TaskNotFoundException without paging its history', async () => {
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          getById: jest.fn().mockRejectedValue(new TaskNotFoundException('missing-task')),
        },
      });

      await expect(service.getHistoryPage('missing-task', {})).rejects.toThrow(
        TaskNotFoundException,
      );

      expect(taskDao.getById).toHaveBeenCalledWith('missing-task');
      expect(taskStatusHistoryDao.findPageByTask).not.toHaveBeenCalled();
    });
  });

  describe('Given:an existing task with a multi-row history, When:getHistoryPage is called', () => {
    it('should project the DAO page to the wire shape oldest-first, nextCursor unchanged', async () => {
      const creation = fakeHistoryEntry({ id: 'entry-1', fromStatus: null, toStatus: 1 });
      const advance = fakeHistoryEntry({ id: 'entry-2', fromStatus: 1, toStatus: 2 });
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskStatusHistoryDao: {
          findPageByTask: jest
            .fn()
            .mockResolvedValue({ items: [creation, advance], nextCursor: 'opaque-cursor' }),
        },
      });

      const result = await service.getHistoryPage('task-id', { cursor: 'incoming-cursor' });

      // The wire entry drops the row's own `id` and `taskId` — a client pages
      // by the opaque cursor and already knows which task it asked about.
      const toWireEntry = (entry: TaskStatusHistoryEntry): HistoryEntryDto => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        assignedUserId: entry.assignedUserId,
        fieldsSnapshot: entry.fieldsSnapshot,
        createdAt: entry.createdAt,
      });

      expect(taskDao.getById).toHaveBeenCalledWith('task-id');
      expect(taskStatusHistoryDao.findPageByTask).toHaveBeenCalledWith(
        'task-id',
        20,
        'incoming-cursor',
      );
      expect(result.items).toEqual([toWireEntry(creation), toWireEntry(advance)]);
      expect(result.nextCursor).toBe('opaque-cursor');
    });
  });

  describe('Given:no limit is requested, When:getHistoryPage is called', () => {
    it('should default the page size to 20', async () => {
      const { service, taskStatusHistoryDao } = taskServiceHarness();

      const result = await service.getHistoryPage('task-id', {});

      expect(taskStatusHistoryDao.findPageByTask).toHaveBeenCalledWith('task-id', 20, undefined);
      expect(result.limit).toBe(20);
    });
  });

  describe('Given:a requested limit above the maximum, When:getHistoryPage is called', () => {
    it('should clamp the page size to 100 rather than rejecting the request', async () => {
      const { service, taskStatusHistoryDao } = taskServiceHarness();

      const result = await service.getHistoryPage('task-id', { limit: 500 });

      expect(taskStatusHistoryDao.findPageByTask).toHaveBeenCalledWith('task-id', 100, undefined);
      expect(result.limit).toBe(100);
    });
  });

  describe('Given:a requested limit within range, When:getHistoryPage is called', () => {
    it('should pass it through unchanged', async () => {
      const { service, taskStatusHistoryDao } = taskServiceHarness();

      const result = await service.getHistoryPage('task-id', { limit: 5 });

      expect(taskStatusHistoryDao.findPageByTask).toHaveBeenCalledWith('task-id', 5, undefined);
      expect(result.limit).toBe(5);
    });
  });

  describe('Given:the task is already closed, When:closeTask is called', () => {
    it('should reject with TaskClosedException and write nothing', async () => {
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ isClosed: true })),
        },
      });

      await expect(service.closeTask('task-id')).rejects.toThrow(TaskClosedException);

      expect(taskDao.close).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.appendClose).not.toHaveBeenCalled();
    });
  });

  describe("Given:the task has not reached its type's final status, When:closeTask is called", () => {
    it('should reject with TaskNotAtFinalStatusException and write nothing', async () => {
      // Default harness registry resolves the final status to 3 — a task
      // still at status 2 has not reached it.
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          getByIdForUpdate: jest.fn().mockResolvedValue(fakeTask({ status: 2, isClosed: false })),
        },
      });

      await expect(service.closeTask('task-id')).rejects.toThrow(TaskNotAtFinalStatusException);

      expect(taskDao.close).not.toHaveBeenCalled();
      expect(taskStatusHistoryDao.appendClose).not.toHaveBeenCalled();
    });
  });

  describe('Given:a task at its final status and not yet closed, When:closeTask is called', () => {
    it('should return the closed task, leaving its assignee unchanged, and append a matching history row inside one transaction', async () => {
      const closedTask = fakeTask({
        id: 'task-id',
        status: 3,
        isClosed: true,
        assignedUserId: ASSIGNEE_ID,
      });
      const { service, transactionMock, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          getByIdForUpdate: jest
            .fn()
            .mockResolvedValue(
              fakeTask({ id: 'task-id', status: 3, isClosed: false, assignedUserId: ASSIGNEE_ID }),
            ),
          close: jest.fn().mockResolvedValue(closedTask),
        },
      });

      const result = await service.closeTask('task-id');

      expect(result).toBe(closedTask);
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(taskDao.close).toHaveBeenCalledWith('task-id', TRANSACTION_MANAGER);
      // The history row records the assignee the task already had — closing
      // is not a status change, so there is no "next" assignee to record.
      expect(taskStatusHistoryDao.appendClose).toHaveBeenCalledWith(
        closedTask,
        TRANSACTION_MANAGER,
      );
    });
  });

  describe('Given:the history append fails after the task was closed, When:closeTask is called', () => {
    it('should propagate the failure out of the transaction rather than returning a task', async () => {
      const failure = new Error('constraint violation');
      const closedTask = fakeTask({ id: 'task-id', status: 3, isClosed: true });
      const { service, taskDao, taskStatusHistoryDao } = taskServiceHarness({
        taskDao: {
          getByIdForUpdate: jest
            .fn()
            .mockResolvedValue(fakeTask({ id: 'task-id', status: 3, isClosed: false })),
          close: jest.fn().mockResolvedValue(closedTask),
        },
        taskStatusHistoryDao: {
          appendClose: jest.fn().mockRejectedValue(failure),
        },
      });

      await expect(service.closeTask('task-id')).rejects.toThrow(failure);

      // Both writes were attempted against the same transaction manager —
      // the point of the explicit transaction is that a real one rolls both
      // back together on this same unmodified rejection, leaving neither
      // write committed, rather than the service catching it and leaving
      // the task closed without its history entry.
      expect(taskDao.close).toHaveBeenCalledTimes(1);
      expect(taskStatusHistoryDao.appendClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a task exists, When:getById is called', () => {
    it('should read it from the primary connection and return it unchanged', async () => {
      const task = fakeTask({ id: 'task-id' });
      const { service, taskDao } = taskServiceHarness({
        taskDao: { getByIdOnPrimary: jest.fn().mockResolvedValue(task) },
      });

      const result = await service.getById('task-id');

      expect(taskDao.getByIdOnPrimary).toHaveBeenCalledWith('task-id');
      expect(result).toBe(task);
    });
  });

  describe('Given:no task exists for the id, When:getById is called', () => {
    it('should propagate the DAO rejection rather than swallow it', async () => {
      const { service } = taskServiceHarness({
        taskDao: {
          getByIdOnPrimary: jest.fn().mockRejectedValue(new TaskNotFoundException('missing-task')),
        },
      });

      await expect(service.getById('missing-task')).rejects.toThrow(TaskNotFoundException);
    });
  });

  describe('Given:an assignee with tasks of different types, When:getTasksPageByAssignee is called', () => {
    it('should map the DAO page to the wire shape, resolving each item’s statusName from its own type', async () => {
      const procurementTask = fakeTask({ id: 'task-1', type: 'procurement', status: 2 });
      const developmentTask = fakeTask({ id: 'task-2', type: 'development', status: 1 });
      const statusNameOf = jest
        .fn()
        .mockImplementation((type: string) =>
          type === 'procurement' ? 'supplier-offers-received' : 'created',
        );
      const { service } = taskServiceHarness({
        taskDao: {
          findPageByAssignee: jest
            .fn()
            .mockResolvedValue({ items: [procurementTask, developmentTask], nextCursor: null }),
        },
        taskTypeRegistry: {
          findByType: jest.fn(),
          finalStatusOf: jest.fn(),
          statusNameOf,
        },
      });

      const result = await service.getTasksPageByAssignee(ASSIGNEE_ID, {});

      expect(statusNameOf).toHaveBeenCalledWith('procurement', 2);
      expect(statusNameOf).toHaveBeenCalledWith('development', 1);
      expect(result.items).toEqual([
        procurementTask.toJSON('supplier-offers-received'),
        developmentTask.toJSON('created'),
      ]);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('Given:no isClosed filter is requested, When:getTasksPageByAssignee is called', () => {
    it('should pass isClosed through as undefined, leaving every task in the page', async () => {
      const { service, taskDao } = taskServiceHarness();

      await service.getTasksPageByAssignee(ASSIGNEE_ID, {});

      expect(taskDao.findPageByAssignee).toHaveBeenCalledWith(
        ASSIGNEE_ID,
        20,
        undefined,
        undefined,
      );
    });
  });

  describe('Given:isClosed:false is requested, When:getTasksPageByAssignee is called', () => {
    it('should pass it straight through to the DAO filter', async () => {
      const { service, taskDao } = taskServiceHarness();

      await service.getTasksPageByAssignee(ASSIGNEE_ID, { isClosed: false });

      expect(taskDao.findPageByAssignee).toHaveBeenCalledWith(ASSIGNEE_ID, 20, undefined, false);
    });
  });

  describe('Given:a cursor is requested, When:getTasksPageByAssignee is called', () => {
    it('should pass it straight through to the DAO', async () => {
      const { service, taskDao } = taskServiceHarness();

      await service.getTasksPageByAssignee(ASSIGNEE_ID, { cursor: 'incoming-cursor' });

      expect(taskDao.findPageByAssignee).toHaveBeenCalledWith(
        ASSIGNEE_ID,
        20,
        'incoming-cursor',
        undefined,
      );
    });
  });

  describe('Given:no limit is requested, When:getTasksPageByAssignee is called', () => {
    it('should default the page size to 20', async () => {
      const { service, taskDao } = taskServiceHarness();

      const result = await service.getTasksPageByAssignee(ASSIGNEE_ID, {});

      expect(taskDao.findPageByAssignee).toHaveBeenCalledWith(
        ASSIGNEE_ID,
        20,
        undefined,
        undefined,
      );
      expect(result.limit).toBe(20);
    });
  });

  describe('Given:a requested limit above the maximum, When:getTasksPageByAssignee is called', () => {
    it('should clamp the page size to 100 rather than rejecting the request', async () => {
      const { service, taskDao } = taskServiceHarness();

      const result = await service.getTasksPageByAssignee(ASSIGNEE_ID, { limit: 500 });

      expect(taskDao.findPageByAssignee).toHaveBeenCalledWith(
        ASSIGNEE_ID,
        100,
        undefined,
        undefined,
      );
      expect(result.limit).toBe(100);
    });
  });
});
