import { BaseDao, type CursorPage } from '@core/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, DeepPartial } from 'typeorm';

import { READ_CONNECTION } from '../infrastructure/database/database.module';
import { UserNotFoundException } from '../task/exception/user-not-found.exception';
import { UserEntity } from './entities/user.entity';
import { User } from './user.model';

/**
 * The one layer that reads the `users` table for anything beyond the
 * existence check `AssigneeExistenceDao` already owns: one user by id (the
 * `GET /users/:id/tasks` URI's 404 gate) and a keyset page over the full
 * seeded set (`GET /users`).
 */
@Injectable()
export class UserDao extends BaseDao<UserEntity, User> {
  constructor(
    @InjectDataSource() writeDataSource: DataSource,
    @InjectDataSource(READ_CONNECTION) readDataSource: DataSource,
  ) {
    super(UserEntity, writeDataSource, readDataSource);
  }

  /**
   * Reads one user with no lock — the existence gate for a request that only
   * needs to confirm the row is there before doing something else (paging
   * that user's tasks), never mutate it. Throws when the row is absent,
   * matching every other `getBy*` accessor in this service: the caller
   * never null-checks the result.
   */
  async getById(userId: string): Promise<User> {
    return this.findOneOrThrow({ id: userId }, () => {
      throw new UserNotFoundException(userId);
    });
  }

  /**
   * Newest-first keyset page over the full user set, ordered the same way
   * `TaskDao.findPageByAssignee` orders tasks — one consistent keyset
   * convention across every listing this service serves. `users` carries no
   * dedicated pagination index (unlike `idx_tasks_assignee_page`): the
   * seeded population this endpoint serves is small enough that a plan
   * without one costs nothing extra today.
   */
  async findPage(limit: number, cursor?: string): Promise<CursorPage<User>> {
    return this.findKeysetPage({
      alias: 'user',
      direction: 'DESC',
      limit,
      cursor,
      applyFilter: () => {},
      keyOf: (user) => ({ createdAt: user.createdAt, id: user.id }),
    });
  }

  protected toDomainModel(entity: UserEntity): User {
    return new User({
      id: entity.id,
      name: entity.name,
      email: entity.email,
      createdAt: entity.createdAt,
    });
  }

  protected toEntity(domainModel: User): DeepPartial<UserEntity> {
    return {
      id: domainModel.id,
      name: domainModel.name,
      email: domainModel.email,
      createdAt: domainModel.createdAt,
    };
  }
}
