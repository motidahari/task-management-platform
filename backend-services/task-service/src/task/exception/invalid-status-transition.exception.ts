import { type AppException, ErrorCode } from '@core/shared';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * The requested status move is out of range for the task's type — forward
 * past its final status, or backward below status 1.
 */
export class InvalidStatusTransitionException
  extends UnprocessableEntityException
  implements AppException
{
  readonly errorCode = ErrorCode.INVALID_STATUS_TRANSITION;

  constructor() {
    super('This status transition is not allowed.');
    this.name = InvalidStatusTransitionException.name;
  }
}
