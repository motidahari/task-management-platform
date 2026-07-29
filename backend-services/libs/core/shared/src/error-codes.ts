/**
 * THE error-code registry. The wire carries the number; code always uses the name.
 *
 * Convention: `errorCode = HTTP status × 100 + serial` — `42203` reads as
 * "422, variant 03". Each status therefore owns a 100-slot block: append inside
 * the block, and NEVER renumber an existing member — the number is public contract.
 *
 * Imported directly by both the backend and the frontend (npm workspaces), so
 * there is no mirror copy that could drift.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 40000,
  TASK_NOT_FOUND = 40400,
  USER_NOT_FOUND = 40401,
  TASK_CLOSED = 40900,
  TASK_STATE_CONFLICT = 40901,
  UNKNOWN_TASK_TYPE = 42200,
  ASSIGNEE_NOT_FOUND = 42201,
  INVALID_STATUS_TRANSITION = 42202,
  MISSING_REQUIRED_FIELDS = 42203,
  TASK_NOT_AT_FINAL_STATUS = 42204,
  THROTTLED = 42900,
  INTERNAL_ERROR = 50000,
}

/** Serial 00 of a status block — the generic code for a status with no specific variant. */
export function defaultErrorCodeForStatus(httpStatus: number): number {
  return httpStatus * 100;
}

/** `40400` → `'TASK_NOT_FOUND'`, or `'UNREGISTERED'` for a number outside the registry. */
export function errorCodeName(errorCode: number): string {
  return ErrorCode[errorCode] ?? 'UNREGISTERED';
}
