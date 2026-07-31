import type { CursorPage } from '@core/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import type { TaskStatusHistoryEntry } from '../domain/task-status-history.dao';
import { Task } from '../domain/task.model';
import { FieldValidatorService } from '../task-type/field-validator.service';
import type { StatusDefinition } from '../task-type/interfaces/task-type-definition.interface';
import { TaskTypeRegistry } from '../task-type/task-type.registry';
import { AssigneeExistenceDao } from './dao/assignee-existence.dao';
import { TaskStatusHistoryWriteDao } from './dao/task-status-history-write.dao';
import { TaskWriteDao } from './dao/task-write.dao';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { HistoryPageQueryDto } from './dto/history-page-query.dto';
import { AssigneeNotFoundException } from './exception/assignee-not-found.exception';
import { InvalidStatusTransitionException } from './exception/invalid-status-transition.exception';
import { MissingRequiredFieldsException } from './exception/missing-required-fields.exception';
import { TaskClosedException } from './exception/task-closed.exception';
import { TaskNotAtFinalStatusException } from './exception/task-not-at-final-status.exception';
import { TaskStateConflictException } from './exception/task-state-conflict.exception';
import { UnknownTaskTypeException } from './exception/unknown-task-type.exception';

/** Applied when the caller sends no `limit` at all. */
const DEFAULT_HISTORY_PAGE_LIMIT = 20;
/** A caller-requested `limit` above this is capped rather than rejected — an oversized ask is not a malformed one. */
const MAX_HISTORY_PAGE_LIMIT = 100;

/** One keyset page of a task's history, plus the `limit` actually applied — the transport layer echoes it back so a client always knows the page size it got. */
export interface HistoryPage extends CursorPage<TaskStatusHistoryEntry> {
  readonly limit: number;
}

/**
 * Single write funnel for the tasks domain. Every mutation opens its own
 * explicit transaction here — `createTask` included: it writes two rows
 * (the task and its creation history entry) that must commit together, or
 * neither survives. Nothing is locked, since the row does not exist until
 * this call creates it; the transaction buys atomicity between the two
 * inserts, not serialization against a concurrent writer. `changeStatus`
 * additionally takes a pessimistic write lock on the task row, so a
 * concurrent change on the same task serializes behind it instead of
 * racing it.
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly taskDao: TaskWriteDao,
    private readonly taskStatusHistoryDao: TaskStatusHistoryWriteDao,
    private readonly assigneeExistenceDao: AssigneeExistenceDao,
    private readonly taskTypeRegistry: TaskTypeRegistry,
    private readonly fieldValidator: FieldValidatorService,
  ) {}

  async createTask(dto: CreateTaskDto): Promise<Task> {
    return this.dataSource.transaction(async (manager) => {
      if (!this.taskTypeRegistry.findByType(dto.type)) {
        throw new UnknownTaskTypeException(dto.type);
      }

      if (!(await this.assigneeExistenceDao.existsById(dto.assignedUserId, manager))) {
        throw new AssigneeNotFoundException(dto.assignedUserId);
      }

      const task = await this.taskDao.create(
        { type: dto.type, assignedUserId: dto.assignedUserId },
        manager,
      );

      await this.taskStatusHistoryDao.appendCreation(task, manager);

      return task;
    });
  }

  /**
   * `expectedStatus` is checked before any transition arithmetic — a stale
   * or duplicate submit gets a deterministic `409` before the request's
   * direction or fields are even considered, rather than a confusing
   * outcome that depends on how far the arithmetic got first.
   */
  async changeStatus(taskId: string, dto: ChangeStatusDto): Promise<Task> {
    return this.dataSource.transaction(async (manager) => {
      const task = await this.taskDao.getByIdForUpdate(taskId, manager);

      if (task.isClosed) {
        throw new TaskClosedException();
      }

      if (task.status !== dto.expectedStatus) {
        throw new TaskStateConflictException(task.status);
      }

      const targetStatus = this.resolveTargetStatus(task, dto.direction);
      const sanitizedFields =
        dto.direction === 'forward'
          ? this.validateForwardFields(task.type, targetStatus, dto.customFields ?? {})
          : {};

      if (!(await this.assigneeExistenceDao.existsById(dto.nextAssignedUserId, manager))) {
        throw new AssigneeNotFoundException(dto.nextAssignedUserId);
      }

      const customFields =
        dto.direction === 'forward'
          ? { ...task.customFields, ...sanitizedFields }
          : task.customFields;

      const updatedTask = await this.taskDao.update(
        taskId,
        { status: targetStatus, assignedUserId: dto.nextAssignedUserId, customFields },
        manager,
      );

      await this.taskStatusHistoryDao.append(
        {
          taskId: updatedTask.id,
          fromStatus: task.status,
          toStatus: targetStatus,
          assignedUserId: updatedTask.assignedUserId,
          fieldsSnapshot: sanitizedFields,
        },
        manager,
      );

      return updatedTask;
    });
  }

  /**
   * The read side of the audit trail every status change writes: confirms
   * the task exists (a 404 gate, run before paging so a nonexistent task
   * never reaches the DAO), then serves its transitions oldest-first. Not
   * wrapped in a transaction — nothing here mutates, so there is nothing to
   * make atomic.
   */
  async getHistoryPage(taskId: string, query: HistoryPageQueryDto): Promise<HistoryPage> {
    await this.taskDao.getById(taskId);

    const limit = this.resolveHistoryPageLimit(query.limit);
    const page = await this.taskStatusHistoryDao.findPageByTask(taskId, limit, query.cursor);

    return { ...page, limit };
  }

  /** Absent defaults to {@link DEFAULT_HISTORY_PAGE_LIMIT}; anything past {@link MAX_HISTORY_PAGE_LIMIT} is capped, not rejected. */
  private resolveHistoryPageLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_HISTORY_PAGE_LIMIT;
    }

    return Math.min(limit, MAX_HISTORY_PAGE_LIMIT);
  }

  /**
   * Closing is a terminal action, not a transition to a further status —
   * the assignee and custom fields carry over untouched, and there is no
   * "next" status for a client to name. A task can only close once, and
   * only once it has reached its type's final status; either violation
   * gets a distinct, deterministic rejection rather than the change-status
   * exceptions, which describe a status move this isn't.
   */
  async closeTask(taskId: string): Promise<Task> {
    return this.dataSource.transaction(async (manager) => {
      const task = await this.taskDao.getByIdForUpdate(taskId, manager);

      if (task.isClosed) {
        throw new TaskClosedException();
      }

      if (task.status !== this.taskTypeRegistry.finalStatusOf(task.type)) {
        throw new TaskNotAtFinalStatusException();
      }

      const closedTask = await this.taskDao.close(taskId, manager);

      await this.taskStatusHistoryDao.appendClose(closedTask, manager);

      return closedTask;
    });
  }

  /**
   * Forward is `status + 1`, backward `status - 1` — one step at a time by
   * construction, so neither direction can skip a status. Past the type's
   * final status, or below status 1, is the same business error regardless
   * of which bound was crossed.
   */
  private resolveTargetStatus(task: Task, direction: ChangeStatusDto['direction']): number {
    const targetStatus = direction === 'forward' ? task.status + 1 : task.status - 1;
    const finalStatus = this.taskTypeRegistry.finalStatusOf(task.type);

    if (targetStatus < 1 || targetStatus > finalStatus) {
      throw new InvalidStatusTransitionException();
    }

    return targetStatus;
  }

  /**
   * Only a forward move validates and sanitizes `customFields` — a backward
   * move re-enters a status the task already satisfied once, so there is
   * nothing new to prove.
   */
  private validateForwardFields(
    type: string,
    targetStatus: number,
    customFields: Record<string, unknown>,
  ): Record<string, string | number> {
    const statusDefinition = this.statusDefinitionOf(type, targetStatus);
    const result = this.fieldValidator.validate(customFields, statusDefinition);

    if (!result.valid) {
      throw new MissingRequiredFieldsException(targetStatus, [
        ...result.missing,
        ...Object.keys(result.invalid),
      ]);
    }

    return result.sanitizedFields;
  }

  /**
   * A persisted task's `type` and status range were already proven
   * registered when `resolveTargetStatus` derived `finalStatusOf` for it —
   * a missing definition or status here is a registry inconsistency, not a
   * client-facing error.
   */
  private statusDefinitionOf(type: string, status: number): StatusDefinition {
    const definition = this.taskTypeRegistry.findByType(type);
    const statusDefinition = definition?.statuses.find((candidate) => candidate.status === status);

    if (!statusDefinition) {
      throw new Error(`Task type "${type}" has no status definition for status ${status}.`);
    }

    return statusDefinition;
  }
}
