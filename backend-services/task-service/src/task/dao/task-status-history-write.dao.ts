import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';

import { READ_CONNECTION } from '../../infrastructure/database/database.module';
import { TaskStatusHistoryDao, TaskStatusHistoryEntry } from '../../domain/task-status-history.dao';

/**
 * Adds the one write path `TaskStatusHistoryDao` doesn't expose: appending a
 * row. A subclass rather than a change to the shared, already-reviewed DAO —
 * this slice only ever appends the creation entry, so it extends the
 * read-only DAO instead of widening a class other slices also depend on.
 */
@Injectable()
export class TaskStatusHistoryWriteDao extends TaskStatusHistoryDao {
  constructor(
    @InjectDataSource() writeDataSource: DataSource,
    @InjectDataSource(READ_CONNECTION) readDataSource: DataSource,
  ) {
    super(writeDataSource, readDataSource);
  }

  /**
   * Appends one immutable audit-trail row. Must run inside the caller's
   * transaction `manager` so it commits atomically with the mutation it
   * records — a task without its matching history row (or the reverse)
   * would be a corrupt audit trail.
   */
  async append(
    entry: {
      taskId: string;
      fromStatus: number | null;
      toStatus: number | null;
      assignedUserId: string;
      fieldsSnapshot: Record<string, unknown>;
    },
    manager: EntityManager,
  ): Promise<TaskStatusHistoryEntry> {
    return await this.insertOne(entry, manager);
  }
}
