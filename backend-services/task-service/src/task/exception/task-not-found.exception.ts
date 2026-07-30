import { type AppException, ErrorCode } from '@core/shared';
import { NotFoundException } from '@nestjs/common';

/**
 * The task addressed by the request URI does not exist.
 */
export class TaskNotFoundException extends NotFoundException implements AppException {
  readonly errorCode = ErrorCode.TASK_NOT_FOUND;

  constructor(taskId: string) {
    super(`Task ${taskId} was not found.`);
    this.name = TaskNotFoundException.name;
  }
}
