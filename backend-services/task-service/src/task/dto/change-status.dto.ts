/**
 * Sanitized, transport-validated input the service receives to change a
 * task's status. Decorated validation (shape, sanitization) is a
 * controller-layer concern this slice does not yet include; by the time an
 * instance reaches `TaskService`, every field is trusted.
 */
export interface ChangeStatusDto {
  readonly direction: 'forward' | 'backward';
  readonly expectedStatus: number;
  readonly nextAssignedUserId: string;
  readonly customFields?: Record<string, unknown>;
}
