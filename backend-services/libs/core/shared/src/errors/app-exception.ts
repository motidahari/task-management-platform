import { HttpException } from '@nestjs/common';

import { ErrorCode } from '../error-codes';
import type { ErrorDetails } from './error-response';

/**
 * What a domain exception adds to a Nest `HttpException`: a stable numeric code
 * and an authored, display-grade message.
 *
 * It is an interface rather than a base class so each exception can extend the
 * Nest exception matching its HTTP status (`NotFoundException`,
 * `ConflictException`, `UnprocessableEntityException`) — the status stays a
 * property of the type instead of a constructor argument callers can get wrong.
 */
export interface AppException extends HttpException {
  readonly errorCode: ErrorCode;
  readonly details?: ErrorDetails;
}

export function isAppException(candidate: unknown): candidate is AppException {
  return (
    candidate instanceof HttpException &&
    typeof (candidate as Partial<AppException>).errorCode === 'number'
  );
}
