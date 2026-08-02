import { BaseDao, type CursorPage, toMicrosecondIso } from '@core/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, DeepPartial, EntityManager } from 'typeorm';

import { READ_CONNECTION } from '../infrastructure/database/database.module';
import { TaskNotFoundException } from '../task/exception/task-not-found.exception';
import { TaskEntity } from './entities/task.entity';
import { Task } from './task.model';

/**
 * The only layer that touches the `tasks` table. Maps `TaskEntity` rows to
 * the plain `Task` domain model in both directions, and keeps every locking
 * read on the write connection — a lock is only meaningful against the
 * primary, and only inside the caller's own transaction.
 */
@Injectable()
export class TaskDao extends BaseDao<TaskEntity, Task> {
  constructor(
    @InjectDataSource() writeDataSource: DataSource,
    @InjectDataSource(READ_CONNECTION) readDataSource: DataSource,
  ) {
    super(TaskEntity, writeDataSource, readDataSource);
  }

  /**
   * Reads one task with a `FOR UPDATE` row lock, so a concurrent status
   * change on the same task serializes behind this one instead of racing it.
   * Must run inside the caller's own transaction — `manager` is that
   * transaction's `EntityManager`, never a fresh one this method opens itself,
   * or the lock would be released the instant the query finishes.
   *
   * Throws when the row is absent, matching every other `getBy*` accessor in
   * this service: the caller never null-checks the result.
   */
  async getByIdForUpdate(taskId: string, manager: EntityManager): Promise<Task> {
    return this.findOneOrThrow(
      { id: taskId },
      () => {
        throw new TaskNotFoundException(taskId);
      },
      { manager, lock: { mode: 'pessimistic_write' } },
    );
  }

  /**
   * Reads one task with no lock — the existence gate for a request that only
   * needs to confirm the row is there before doing something else (e.g.
   * paging its history), never mutate it. Unlike `getByIdForUpdate`, safe to
   * call outside a transaction, and reads from the replica-capable
   * connection since nothing here depends on seeing the latest write.
   *
   * Throws when the row is absent, matching every other `getBy*` accessor in
   * this service: the caller never null-checks the result.
   */
  async getById(taskId: string): Promise<Task> {
    return this.findOneOrThrow({ id: taskId }, () => {
      throw new TaskNotFoundException(taskId);
    });
  }

  /**
   * Reads one task with no lock, from the primary/write connection rather
   * than the replica-capable one `getById` uses — for the one read that must
   * see its own immediately-preceding write (a client's natural
   * mutate-then-fetch flow). Not `findOneOrThrow`, which only ever reads
   * either the replica-capable connection or a transaction's own manager:
   * this read is neither — no transaction, but the primary.
   *
   * Throws when the row is absent, matching every other `getBy*` accessor in
   * this service: the caller never null-checks the result.
   */
  async getByIdOnPrimary(taskId: string): Promise<Task> {
    const entity = await this.writeRepository.findOne({ where: { id: taskId } });

    if (!entity) {
      throw new TaskNotFoundException(taskId);
    }

    return this.toDomainModel(entity);
  }

  /**
   * Newest-first keyset page of one assignee's tasks. Ordering, index and
   * predicate all agree on `(created_at DESC, id DESC)` — `id` breaks ties
   * between rows sharing one `created_at`, which two transitions landing in
   * the same millisecond can otherwise do, so a plain `created_at`-only
   * comparison would skip or duplicate a row exactly at a page boundary.
   * Lag-tolerant, so it reads from the replica-capable connection.
   *
   * `isClosed` is optional and additive: omitted, the page is every task
   * assigned to the user, exactly today's behavior; supplied, it narrows to
   * open or closed tasks only. `isClosed: false` is also the one variant
   * with its own partial index, so filtering to "my open tasks" costs
   * nothing extra to plan.
   */
  async findPageByAssignee(
    assignedUserId: string,
    limit: number,
    cursor?: string,
    isClosed?: boolean,
  ): Promise<CursorPage<Task>> {
    return this.findKeysetPage({
      alias: 'task',
      direction: 'DESC',
      limit,
      cursor,
      applyFilter: (queryBuilder) => {
        queryBuilder.where('task.assignedUserId = :assignedUserId', { assignedUserId });

        if (isClosed !== undefined) {
          queryBuilder.andWhere('task.isClosed = :isClosed', { isClosed });
        }
      },
      keyOf: (task) => ({ createdAt: toMicrosecondIso(task.createdAtRaw), id: task.id }),
    });
  }

  protected toDomainModel(entity: TaskEntity): Task {
    return new Task({
      id: entity.id,
      type: entity.type,
      status: entity.status,
      isClosed: entity.isClosed,
      assignedUserId: entity.assignedUserId,
      customFields: entity.customFields,
      createdAt: entity.createdAt,
      updatedAt: toMicrosecondIso(entity.updatedAtRaw),
    });
  }

  /**
   * `updatedAt` is deliberately absent: it is the microsecond-precision
   * projection the domain model carries as a string, never a value any
   * write path assigns back onto the `timestamptz` column — the column
   * updates itself (`@UpdateDateColumn`), and a `toEntity` writing a string
   * into it would corrupt the type it was declared with.
   */
  protected toEntity(domainModel: Task): DeepPartial<TaskEntity> {
    return {
      id: domainModel.id,
      type: domainModel.type,
      status: domainModel.status,
      isClosed: domainModel.isClosed,
      assignedUserId: domainModel.assignedUserId,
      customFields: domainModel.customFields,
      createdAt: domainModel.createdAt,
    };
  }
}
