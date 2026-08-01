import { Injectable } from '@nestjs/common';

import { UserDao } from '../domain/user.dao';
import type { TaskPageDto } from '../task/dto/task-page.dto';
import { TasksPageQueryDto } from '../task/dto/tasks-page-query.dto';
import { TaskService } from '../task/task.service';
import type { UserPageDto } from './dto/user-page.dto';
import { UsersPageQueryDto } from './dto/users-page-query.dto';
import { toUserResponse } from './user-response.mapper';

/** Applied when the caller sends no `limit` at all, on any keyset page this service serves. */
const DEFAULT_PAGE_LIMIT = 20;
/** A caller-requested `limit` above this is capped rather than rejected — an oversized ask is not a malformed one. */
const MAX_PAGE_LIMIT = 100;

/**
 * Read-only transport slice for the users domain. `getUserTasks` gates on
 * the user existing (the `GET /users/:id/tasks` URI's 404) before handing
 * off the actual paging to `TaskService`, which already owns every
 * task-listing concern — this class never reimplements that paging.
 */
@Injectable()
export class UserService {
  constructor(
    private readonly userDao: UserDao,
    private readonly taskService: TaskService,
  ) {}

  async listUsers(query: UsersPageQueryDto): Promise<UserPageDto> {
    const limit = this.resolvePageLimit(query.limit);
    const page = await this.userDao.findPage(limit, query.cursor);

    return {
      items: page.items.map((user) => toUserResponse(user)),
      nextCursor: page.nextCursor,
      limit,
    };
  }

  /**
   * Confirms the user addressed by the URI exists — a 404 gate, run before
   * paging so a nonexistent user never reaches `TaskService` — then hands
   * off paging to it entirely. A user with no assigned tasks pages to an
   * empty, valid result, not a 404.
   */
  async getUserTasks(userId: string, query: TasksPageQueryDto): Promise<TaskPageDto> {
    await this.userDao.getById(userId);

    return this.taskService.getTasksPageByAssignee(userId, query);
  }

  /** Absent defaults to {@link DEFAULT_PAGE_LIMIT}; anything past {@link MAX_PAGE_LIMIT} is capped, not rejected. */
  private resolvePageLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_PAGE_LIMIT;
    }

    return Math.min(limit, MAX_PAGE_LIMIT);
  }
}
