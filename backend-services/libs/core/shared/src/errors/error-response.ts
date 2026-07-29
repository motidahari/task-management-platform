/**
 * `details` is a whitelist, not a passthrough: only the shapes the API contract
 * defines may reach a client. Adding a shape here is a contract change.
 */
export interface FieldProblemsDetails {
  readonly missing?: readonly string[];
  readonly invalid?: readonly string[];
}

export interface ValidationMessagesDetails {
  readonly validation: readonly string[];
}

export interface StateConflictDetails {
  readonly currentStatus: number;
}

export type ErrorDetails = FieldProblemsDetails | ValidationMessagesDetails | StateConflictDetails;

/** The single response shape for every failure, whatever its cause. */
export interface ErrorResponse {
  readonly errorCode: number;
  readonly errorMessage: string;
  readonly details?: ErrorDetails;
}
