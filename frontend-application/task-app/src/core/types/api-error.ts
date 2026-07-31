import type { ErrorCode } from '@core/shared/error-codes';
import type { ErrorDetails } from '@core/shared/errors/error-response';

/**
 * The one shape every HTTP failure resolves to, whatever the transport-level
 * cause — a mapped server envelope, a malformed one, or no response at all.
 * `errorCode`/`status` are what stores branch on; `isNetworkError` separates
 * "no response reached us" from "the server answered with a failure".
 */
export interface ApiError {
  readonly errorCode: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;
  readonly isNetworkError: boolean;
}
