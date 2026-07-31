import { type AppException, ErrorCode } from '@core/shared';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A close request was made against a task that has not reached the final
 * status of its type.
 */
export class TaskNotAtFinalStatusException
  extends UnprocessableEntityException
  implements AppException
{
  readonly errorCode = ErrorCode.TASK_NOT_AT_FINAL_STATUS;

  constructor() {
    super('Task is not at its final status.');
    this.name = TaskNotAtFinalStatusException.name;
  }
}
