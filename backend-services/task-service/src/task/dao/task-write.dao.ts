import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';

import { READ_CONNECTION } from '../../infrastructure/database/database.module';
import { TaskDao } from '../../domain/task.dao';
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
}
