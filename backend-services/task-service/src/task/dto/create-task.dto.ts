/**
 * Sanitized, transport-validated input the service receives to create a
 * task. Decorated validation (shape, sanitization) is a controller-layer
 * concern this slice does not yet include; by the time an instance reaches
 * `TaskService`, both fields are trusted.
 */
export interface CreateTaskDto {
  readonly type: string;
  readonly assignedUserId: string;
}
