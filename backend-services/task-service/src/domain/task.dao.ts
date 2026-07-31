import { BaseDao, type CursorPage } from '@core/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, DeepPartial, EntityManager } from 'typeorm';

import { READ_CONNECTION } from '../infrastructure/database/database.module';
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
   * this service: the caller never null-checks the result. A dedicated
   * domain exception for this outcome isn't wired into this slice yet, so
   * this uses the framework's own not-found exception in the meantime.
   */
  async getByIdForUpdate(taskId: string, manager: EntityManager): Promise<Task> {
    const entity = await this.repositoryFor(manager).findOne({
      where: { id: taskId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!entity) {
      throw new NotFoundException('Task not found');
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
   */
  async findPageByAssignee(
    assignedUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<Task>> {
    return this.findKeysetPage({
      alias: 'task',
      direction: 'DESC',
      limit,
      cursor,
      applyFilter: (queryBuilder) =>
        queryBuilder.where('task.assignedUserId = :assignedUserId', { assignedUserId }),
      keyOf: (task) => ({ createdAt: task.createdAt, id: task.id }),
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
      updatedAt: entity.updatedAt,
    });
  }

  protected toEntity(domainModel: Task): DeepPartial<TaskEntity> {
    return {
      id: domainModel.id,
      type: domainModel.type,
      status: domainModel.status,
      isClosed: domainModel.isClosed,
      assignedUserId: domainModel.assignedUserId,
      customFields: domainModel.customFields,
      createdAt: domainModel.createdAt,
      updatedAt: domainModel.updatedAt,
    };
  }
}
