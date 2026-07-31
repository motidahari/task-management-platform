import { type AppException, ErrorCode, type StateConflictDetails } from '@core/shared';
import { ConflictException } from '@nestjs/common';

/**
 * The caller's `expectedStatus` no longer matches the task's current status —
 * a stale client or a duplicate submit. Rejected before anything else
 * state-dependent so a duplicate submit gets a deterministic, retry-safe
 * answer.
 */
export class TaskStateConflictException extends ConflictException implements AppException {
  readonly errorCode = ErrorCode.TASK_STATE_CONFLICT;
  readonly details: StateConflictDetails;

  constructor(currentStatus: number) {
    super('The task has changed since it was last loaded. Please refresh and try again.');
    this.name = TaskStateConflictException.name;
    this.details = { currentStatus };
  }
}
