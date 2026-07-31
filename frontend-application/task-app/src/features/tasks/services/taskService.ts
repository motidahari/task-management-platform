import { BaseHttpService } from '../../../core/services/BaseHttpService';
import type { Task } from '../types';
import type {
  ChangeTaskStatusDto,
  CreateTaskDto,
  TaskListFilters,
  TaskListPage,
} from './taskService.dto';

interface ListTasksForUserParams extends TaskListFilters {
  readonly limit?: number;
  readonly cursor?: string;
}

/**
 * The task domain's only HTTP surface — list/create/read/mutate a task.
 * Every method is a relative path plus a typed body/response; transport
 * concerns (host, headers, error mapping) live entirely in the base class.
 */
export class TaskService extends BaseHttpService {
  constructor() {
    super();
  }

  /** Keyset-paginated tasks assigned to one user — `params.cursor` continues a prior page. */
  listTasksForUser(userId: string, params?: ListTasksForUserParams): Promise<TaskListPage> {
    return this.get<TaskListPage>(`/users/${userId}/tasks`, params as Record<string, unknown>);
  }

  getTask(taskId: string): Promise<Task> {
    return this.get<Task>(`/tasks/${taskId}`);
  }

  createTask(dto: CreateTaskDto): Promise<Task> {
    return this.post<Task>('/tasks', dto);
  }

  /** Sends `expectedStatus` so a stale/duplicate submission fails deterministically instead of double-applying. */
  changeTaskStatus(taskId: string, dto: ChangeTaskStatusDto): Promise<Task> {
    return this.patch<Task>(`/tasks/${taskId}/status`, dto);
  }

  closeTask(taskId: string): Promise<Task> {
    return this.post<Task>(`/tasks/${taskId}/close`);
  }
}

export const taskService = new TaskService();
