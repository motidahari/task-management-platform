import { type AppException, ErrorCode } from '@core/shared';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A user referenced in the request body (`assignedUserId`,
 * `nextAssignedUserId`) does not exist. The task endpoint itself is valid, so
 * this is 422, not 404 — 404 stays reserved for URI-addressed resources.
 */
export class AssigneeNotFoundException
  extends UnprocessableEntityException
  implements AppException
{
  readonly errorCode = ErrorCode.ASSIGNEE_NOT_FOUND;

  constructor(userId: string) {
    super(`Assignee ${userId} was not found.`);
    this.name = AssigneeNotFoundException.name;
  }
}
