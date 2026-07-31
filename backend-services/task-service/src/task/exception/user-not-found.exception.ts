import { type AppException, ErrorCode } from '@core/shared';
import { NotFoundException } from '@nestjs/common';

/**
 * The user addressed by the request URI does not exist. Reserved for URI
 * contexts (e.g. `GET /users/:id/tasks`) — a user referenced in a request
 * body is `AssigneeNotFoundException` instead.
 */
export class UserNotFoundException extends NotFoundException implements AppException {
  readonly errorCode = ErrorCode.USER_NOT_FOUND;

  constructor(userId: string) {
    super(`User ${userId} was not found.`);
    this.name = UserNotFoundException.name;
  }
}
