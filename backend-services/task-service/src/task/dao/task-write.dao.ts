import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { READ_CONNECTION } from '../../infrastructure/database/database.module';
import { TaskDao } from '../../domain/task.dao';
import { TaskEntity } from '../../domain/entities/task.entity';
import { Task } from '../../domain/task.model';

/**
 * Adds the one write path `TaskDao` doesn't expose: inserting a brand new
 * task. A subclass rather than a change to the shared, already-reviewed
 * `TaskDao` — this slice owns `createTask` alone, so it extends the
 * read-only DAO instead of widening a class other slices also depend on;
 * `repositoryFor` and `toDomainModel` are `protected` on the base class
 * specifically so a subclass in the same layer can reach them.
 */
@Injectable()
export class TaskWriteDao extends TaskDao {
  constructor(
    @InjectDataSource() writeDataSource: DataSource,
    @InjectDataSource(READ_CONNECTION) readDataSource: DataSource,
  ) {
    super(writeDataSource, readDataSource);
  }

  /**
   * Inserts a new task at status 1, unclosed, with empty custom fields — the
   * one shape every task starts from, whichever type it is. Must run inside
   * the caller's transaction `manager` so the row commits atomically with
   * the creation history row the service appends alongside it; a task
   * without that row (or the reverse) would be a corrupt audit trail.
   */
  async create(
    params: { type: string; assignedUserId: string },
    manager: EntityManager,
  ): Promise<Task> {
    return await this.insertOne(params, manager);
  }

  /**
   * Updates status, assignee and custom fields in the one statement a
   * status change ever makes to the task row. `RETURNING *` hands back the
   * row this same statement just committed, so there is no follow-up
   * `SELECT` that could observe a different snapshot than the write it is
   * meant to confirm. Must run inside the caller's transaction `manager` so
   * it commits atomically with the history row the service appends
   * alongside it.
   */
  async update(
    taskId: string,
    params: { status: number; assignedUserId: string; customFields: Record<string, unknown> },
    manager: EntityManager,
  ): Promise<Task> {
    const updateResult = await this.repositoryFor(manager)
      .createQueryBuilder()
      .update(TaskEntity)
      .set({
        status: params.status,
        assignedUserId: params.assignedUserId,
        customFields: params.customFields,
      } as QueryDeepPartialEntity<TaskEntity>)
      .where('id = :taskId', { taskId })
      .returning('*')
      .execute();

    const [rawRow] = updateResult.raw as RawUpdatedTaskRow[];

    if (!rawRow) {
      // The caller already holds this row's write lock inside the same
      // transaction — an update matching zero rows here would mean the id
      // vanished between the lock and this statement, which the lock rules
      // out. Not a client-facing outcome, so a plain `Error` rather than a
      // typed exception.
      throw new Error(`Update of task ${taskId} returned no row.`);
    }

    return this.toDomainModel(toTaskEntity(rawRow));
  }

  /**
   * Flips `is_closed` alone, leaving status, assignee and custom fields
   * exactly as they were — closing is not a status change. `RETURNING *`
   * mirrors `update`, for the same reason: no follow-up `SELECT` that could
   * observe a different snapshot than the write it is meant to confirm.
   * Must run inside the caller's transaction `manager` so it commits
   * atomically with the history row the service appends alongside it.
   */
  async close(taskId: string, manager: EntityManager): Promise<Task> {
    const updateResult = await this.repositoryFor(manager)
      .createQueryBuilder()
      .update(TaskEntity)
      .set({ isClosed: true })
      .where('id = :taskId', { taskId })
      .returning('*')
      .execute();

    const [rawRow] = updateResult.raw as RawUpdatedTaskRow[];

    if (!rawRow) {
      // Same reasoning as `update`: the caller already holds this row's
      // write lock, so a zero-row match here is a registry inconsistency,
      // not a client-facing outcome.
      throw new Error(`Close of task ${taskId} returned no row.`);
    }

    return this.toDomainModel(toTaskEntity(rawRow));
  }
}

/**
 * Postgres's `RETURNING *` hands the driver back raw rows keyed by column
 * name, not TypeORM's hydrated, camel-cased entity — this is the one shape
 * `toDomainModel` expects, translated from the other.
 */
interface RawUpdatedTaskRow {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly is_closed: boolean;
  readonly assigned_user_id: string;
  readonly custom_fields: Record<string, unknown>;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function toTaskEntity(row: RawUpdatedTaskRow): TaskEntity {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    isClosed: row.is_closed,
    assignedUserId: row.assigned_user_id,
    customFields: row.custom_fields,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
