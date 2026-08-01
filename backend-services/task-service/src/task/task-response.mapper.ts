import { Task } from '../domain/task.model';
import { TaskResponseDto } from './dto/task-response.dto';

/**
 * The one place a `Task` domain model becomes the wire response shape —
 * every endpoint that returns a task routes through this, so there is
 * exactly one spot that could ever get the shape wrong. `statusName` is
 * supplied by the caller rather than resolved here: only the caller (via
 * `TaskTypeRegistry`) has the registry context this class deliberately
 * never reaches for.
 */
export function toTaskResponse(task: Task, statusName: string): TaskResponseDto {
  return task.toJSON(statusName);
}
