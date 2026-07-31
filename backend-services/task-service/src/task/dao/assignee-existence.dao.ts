import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { UserEntity } from '../../domain/entities/user.entity';

/**
 * The one question the tasks write path needs of `users`: does this id
 * exist. Existence-only, and deliberately not a full `UserDao` extending
 * `BaseDao` — nothing here reads a user's own fields, so there is no
 * domain model to translate rows into yet; a later slice that does add
 * `GET /users` grows that DAO independently, in `src/domain/`, from this
 * one call site.
 */
@Injectable()
export class AssigneeExistenceDao {
  /**
   * Checked inside the caller's transaction `manager` — the assignee check
   * that gates task creation (and every status change) must see the same
   * snapshot as the rest of that transaction.
   */
  async existsById(userId: string, manager: EntityManager): Promise<boolean> {
    const count = await manager.getRepository(UserEntity).count({ where: { id: userId } });

    return count > 0;
  }
}
