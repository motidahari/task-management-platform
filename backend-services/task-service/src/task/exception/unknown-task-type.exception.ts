import { type AppException, ErrorCode } from '@core/shared';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * The `type` key on a create request does not match any registered task-type
 * definition.
 */
export class UnknownTaskTypeException extends UnprocessableEntityException implements AppException {
  readonly errorCode = ErrorCode.UNKNOWN_TASK_TYPE;

  constructor(type: string) {
    super(`Task type "${type}" is not recognized.`);
    this.name = UnknownTaskTypeException.name;
  }
}
