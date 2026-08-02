import { BaseDao, type CursorPage, toMicrosecondIso } from '@core/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, DeepPartial } from 'typeorm';

import { READ_CONNECTION } from '../infrastructure/database/database.module';
import { TaskStatusHistoryEntity } from './entities/task-status-history.entity';

/**
 * One audit-trail row, read-only by nature — a history entry is written once
 * (by the service, as part of the transition it records) and never mutated
 * afterwards, so unlike `Task` it carries no setters to guard a later
 * assignment: nothing ever makes one.
 */
export interface TaskStatusHistoryEntry {
  readonly id: string;
  readonly taskId: string;
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly assignedUserId: string;
  readonly fieldsSnapshot: Record<string, unknown>;
  readonly createdAt: Date;
}

/**
 * The only layer that touches the `task_status_history` table. Read-only for
 * now — appending a row is part of the same transaction as the mutation it
 * records, which belongs to whichever service owns that transaction.
 */
@Injectable()
export class TaskStatusHistoryDao extends BaseDao<TaskStatusHistoryEntity, TaskStatusHistoryEntry> {
  constructor(
    @InjectDataSource() writeDataSource: DataSource,
    @InjectDataSource(READ_CONNECTION) readDataSource: DataSource,
  ) {
    super(TaskStatusHistoryEntity, writeDataSource, readDataSource);
  }

  /**
   * Oldest-first keyset page of one task's timeline — the natural reading
   * order for an audit trail. Ordering, index and predicate all agree on
   * `(created_at ASC, id ASC)`: a task's creation and its immediate first
   * transition can land in the same millisecond, so `id` breaks that tie the
   * same way it does for the assignee page, just walked in the other
   * direction.
   */
  async findPageByTask(
    taskId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<TaskStatusHistoryEntry>> {
    return this.findKeysetPage({
      alias: 'history',
      direction: 'ASC',
      limit,
      cursor,
      applyFilter: (queryBuilder) => queryBuilder.where('history.taskId = :taskId', { taskId }),
      keyOf: (history) => ({ createdAt: toMicrosecondIso(history.createdAtRaw), id: history.id }),
    });
  }

  protected toDomainModel(entity: TaskStatusHistoryEntity): TaskStatusHistoryEntry {
    return {
      id: entity.id,
      taskId: entity.taskId,
      fromStatus: entity.fromStatus,
      toStatus: entity.toStatus,
      assignedUserId: entity.assignedUserId,
      fieldsSnapshot: entity.fieldsSnapshot,
      createdAt: entity.createdAt,
    };
  }

  protected toEntity(domainModel: TaskStatusHistoryEntry): DeepPartial<TaskStatusHistoryEntity> {
    return {
      id: domainModel.id,
      taskId: domainModel.taskId,
      fromStatus: domainModel.fromStatus,
      toStatus: domainModel.toStatus,
      assignedUserId: domainModel.assignedUserId,
      fieldsSnapshot: domainModel.fieldsSnapshot,
      createdAt: domainModel.createdAt,
    };
  }
}
