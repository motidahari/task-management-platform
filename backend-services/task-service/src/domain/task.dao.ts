import { BaseDao, ValidationException } from '@core/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, DeepPartial, EntityManager } from 'typeorm';

import { READ_CONNECTION } from '../infrastructure/database/database.module';
import { TaskEntity } from './entities/task.entity';
import { Task } from './task.model';

/** One page of a keyset-paginated list, plus the opaque cursor for the next one (`null` once exhausted). */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Decoded shape of an opaque keyset cursor — the last row's ordering key. */
export interface KeysetCursor {
  readonly createdAt: Date;
  readonly id: string;
}

const MALFORMED_CURSOR_MESSAGE = 'Pagination cursor is malformed';

/**
 * Base64 of `{ createdAt, id }` — opaque to the client, just carries the
 * ordering key of the last row on the page so the next request can resume
 * exactly where this one stopped.
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

/**
 * The inverse of {@link encodeKeysetCursor}. A client can hand back anything —
 * a hand-edited value, a cursor from an unrelated endpoint, plain garbage —
 * so every failure mode (bad base64, bad JSON, wrong shape, unparsable date)
 * collapses to the same `ValidationException`, which the transport layer maps
 * to 400 rather than letting a malformed value reach the query planner.
 */
export function decodeKeysetCursor(cursor: string): KeysetCursor {
  const decoded = parseCursorJson(cursor);

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  const { createdAt, id } = decoded as Record<string, unknown>;

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  if (typeof createdAt !== 'string') {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  const parsedCreatedAt = new Date(createdAt);

  if (Number.isNaN(parsedCreatedAt.getTime())) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  return { createdAt: parsedCreatedAt, id };
}

function parseCursorJson(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }
}

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
    const afterCursor = cursor === undefined ? null : decodeKeysetCursor(cursor);

    const queryBuilder = this.readRepository
      .createQueryBuilder('task')
      .where('task.assignedUserId = :assignedUserId', { assignedUserId })
      .orderBy('task.createdAt', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .take(limit + 1);

    if (afterCursor) {
      queryBuilder.andWhere('(task.createdAt, task.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: afterCursor.createdAt,
        cursorId: afterCursor.id,
      });
    }

    const rows = await queryBuilder.getMany();
    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: this.toDomainModels(pageRows),
      nextCursor:
        hasNextPage && lastRow
          ? encodeKeysetCursor({ createdAt: lastRow.createdAt, id: lastRow.id })
          : null,
    };
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
