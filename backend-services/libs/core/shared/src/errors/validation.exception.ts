import { BadRequestException } from '@nestjs/common';

import { ErrorCode } from '../error-codes';
import type { AppException } from './app-exception';

/**
 * A model invariant was violated — the object would be internally invalid.
 * Thrown by domain-model constructors and setters, so an invalid instance
 * cannot exist in memory no matter which code path built it.
 */
export class ValidationException extends BadRequestException implements AppException {
  readonly errorCode = ErrorCode.VALIDATION_ERROR;

  constructor(message: string) {
    super(message);
    this.name = ValidationException.name;
  }
}
