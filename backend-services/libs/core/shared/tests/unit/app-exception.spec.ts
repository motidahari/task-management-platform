import { ConflictException, NotFoundException } from '@nestjs/common';

import { ErrorCode } from '../../src/error-codes';
import { type AppException, isAppException } from '../../src/errors/app-exception';
import { ValidationException } from '../../src/errors/validation.exception';

describe('app-exception', () => {
  class TaskClosedException extends ConflictException implements AppException {
    readonly errorCode = ErrorCode.TASK_CLOSED;

    constructor() {
      super('Task is closed');
    }
  }

  describe('isAppException', () => {
    describe('Given:a typed domain exception, When:classifying it', () => {
      it('should recognize it', () => {
        expect(isAppException(new TaskClosedException())).toBe(true);
      });
    });

    describe('Given:a framework HTTP exception without an error code, When:classifying it', () => {
      it('should reject it, so the filter substitutes a generic body', () => {
        expect(isAppException(new NotFoundException('Cannot GET /nope'))).toBe(false);
      });
    });

    describe('Given:a non-HTTP error, When:classifying it', () => {
      it.each([
        ['a plain Error', new Error('boom')],
        ['an object shaped like one', { errorCode: ErrorCode.TASK_CLOSED }],
        ['null', null],
        ['undefined', undefined],
      ])('should reject %s', (_label, candidate) => {
        expect(isAppException(candidate)).toBe(false);
      });
    });
  });

  describe('ValidationException', () => {
    describe('Given:a violated model invariant, When:the exception is thrown', () => {
      it('should carry the VALIDATION_ERROR code', () => {
        expect(new ValidationException('status must be at least 1').errorCode).toBe(
          ErrorCode.VALIDATION_ERROR,
        );
      });

      it('should map to HTTP 400', () => {
        expect(new ValidationException('status must be at least 1').getStatus()).toBe(400);
      });

      it('should keep the authored message', () => {
        expect(new ValidationException('status must be at least 1').message).toBe(
          'status must be at least 1',
        );
      });

      it('should be recognized by the filter as a typed exception', () => {
        expect(isAppException(new ValidationException('status must be at least 1'))).toBe(true);
      });
    });
  });
});
