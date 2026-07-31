import { BaseHttpService } from '../../../core/services/BaseHttpService';
import type { ListUsersParams, UserListPage } from './userService.dto';

/**
 * The user domain's only HTTP surface — the seeded user list that backs the
 * picker. Tasks assigned to one user are already `taskService`'s
 * `GET /users/:id/tasks` (`listTasksForUser`), so this service never
 * duplicates that route.
 */
export class UserService extends BaseHttpService {
  constructor() {
    super();
  }

  /** Keyset-paginated seeded users — `params.cursor` continues a prior page. */
  listUsers(params?: ListUsersParams): Promise<UserListPage> {
    return this.get<UserListPage>('/users', params as Record<string, unknown>);
  }
}

export const userService = new UserService();
