import { type AppException, ErrorCode } from '@core/shared';
import { ConflictException } from '@nestjs/common';

/**
 * Any mutation attempted against a task that is already closed — closed
 * tasks are immutable.
 */
export class TaskClosedException extends ConflictException implements AppException {
  readonly errorCode = ErrorCode.TASK_CLOSED;

  constructor() {
    super('Task is closed');
    this.name = TaskClosedException.name;
  }
}
