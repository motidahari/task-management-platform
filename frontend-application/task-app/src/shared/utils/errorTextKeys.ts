import { ErrorCode } from '@core/shared/error-codes';

/**
 * Every `ErrorCode` the client chooses to give its own copy, mapped to a
 * translation key — never to text directly, so the copy still lives in the
 * locale dictionary like every other user-facing string. `INTERNAL_ERROR` is
 * deliberately absent: it (and any future code added here without a mapping)
 * falls through `resolveErrorText` to the generic message instead of ever
 * reaching the server's own `errorMessage`.
 */
export const ERROR_TEXT_KEYS: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_ERROR]: 'shared-errors.invalid-details',
  [ErrorCode.TASK_NOT_FOUND]: 'shared-errors.task-not-found',
  [ErrorCode.USER_NOT_FOUND]: 'shared-errors.user-not-found',
  [ErrorCode.TASK_CLOSED]: 'shared-errors.task-closed',
  [ErrorCode.TASK_STATE_CONFLICT]: 'shared-errors.task-changed',
  [ErrorCode.UNKNOWN_TASK_TYPE]: 'shared-errors.invalid-details',
  [ErrorCode.ASSIGNEE_NOT_FOUND]: 'shared-errors.invalid-details',
  [ErrorCode.INVALID_STATUS_TRANSITION]: 'shared-errors.invalid-action',
  [ErrorCode.MISSING_REQUIRED_FIELDS]: 'shared-errors.missing-fields',
  [ErrorCode.TASK_NOT_AT_FINAL_STATUS]: 'shared-errors.invalid-action',
  [ErrorCode.THROTTLED]: 'shared-errors.too-many-requests',
};
