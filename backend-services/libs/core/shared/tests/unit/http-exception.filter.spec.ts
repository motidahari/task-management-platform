import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ErrorCode } from '../../src/error-codes';
import type { AppException } from '../../src/errors/app-exception';
import type { ErrorResponse } from '../../src/errors/error-response';
import { HttpExceptionFilter } from '../../src/filters/http-exception.filter';
import { type LogLevel, Logger, type LogSink } from '../../src/logging/logger';

class TaskStateConflictException extends ConflictException implements AppException {
  readonly errorCode = ErrorCode.TASK_STATE_CONFLICT;

  constructor(readonly details: { readonly currentStatus: number }) {
    super('The task was updated by someone else');
  }
}

class UnknownTaskTypeException extends UnprocessableEntityException implements AppException {
  readonly errorCode = ErrorCode.UNKNOWN_TASK_TYPE;

  constructor() {
    super('Unknown task type');
  }
}

interface CapturedResponse {
  status?: number;
  body?: ErrorResponse;
}

interface CapturedLog {
  readonly level: LogLevel;
  readonly record: Record<string, unknown>;
}

const REQUEST = { method: 'PATCH', url: '/api/v1/tasks/t-1/status', id: 'req-42', headers: {} };

function hostFor(captured: CapturedResponse, request: object = REQUEST): ArgumentsHost {
  const response = {
    status(statusCode: number) {
      captured.status = statusCode;

      return {
        json(body: unknown) {
          captured.body = body as ErrorResponse;
        },
      };
    },
  };

  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let captured: CapturedResponse;
  let logs: CapturedLog[];
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    captured = {};
    logs = [];
    const sink: LogSink = (level, line) => {
      logs.push({ level, record: JSON.parse(line) as Record<string, unknown> });
    };
    filter = new HttpExceptionFilter(new Logger('HttpExceptionFilter', sink));
  });

  describe('Given:a typed domain exception, When:it reaches the filter', () => {
    it('should answer with the exception own HTTP status', () => {
      filter.catch(new UnknownTaskTypeException(), hostFor(captured));

      expect(captured.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should send the exception numeric code and authored message', () => {
      filter.catch(new UnknownTaskTypeException(), hostFor(captured));

      expect(captured.body).toEqual({
        errorCode: ErrorCode.UNKNOWN_TASK_TYPE,
        errorMessage: 'Unknown task type',
      });
    });

    it('should omit details entirely when the exception carries none', () => {
      filter.catch(new UnknownTaskTypeException(), hostFor(captured));

      expect(captured.body).not.toHaveProperty('details');
    });

    it('should forward whitelisted details when the exception carries them', () => {
      filter.catch(new TaskStateConflictException({ currentStatus: 3 }), hostFor(captured));

      expect(captured.body).toEqual({
        errorCode: ErrorCode.TASK_STATE_CONFLICT,
        errorMessage: 'The task was updated by someone else',
        details: { currentStatus: 3 },
      });
    });

    it('should log it as a warning with the request id and the code name', () => {
      filter.catch(new TaskStateConflictException({ currentStatus: 3 }), hostFor(captured));

      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[0]?.record).toMatchObject({
        requestId: 'req-42',
        method: 'PATCH',
        url: '/api/v1/tasks/t-1/status',
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.TASK_STATE_CONFLICT,
        errorCodeName: 'TASK_STATE_CONFLICT',
      });
    });
  });

  describe('Given:the global ValidationPipe rejected a DTO, When:its 400 reaches the filter', () => {
    const pipeException = (): BadRequestException =>
      new BadRequestException({
        statusCode: 400,
        message: ['direction must be forward or backward', 'expectedStatus must be an integer'],
        error: 'Bad Request',
      });

    it('should map it to VALIDATION_ERROR with the constraint messages in details', () => {
      filter.catch(pipeException(), hostFor(captured));

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
      expect(captured.body).toEqual({
        errorCode: ErrorCode.VALIDATION_ERROR,
        errorMessage: 'Bad Request',
        details: {
          validation: [
            'direction must be forward or backward',
            'expectedStatus must be an integer',
          ],
        },
      });
    });

    it('should omit details when the 400 carries no constraint list', () => {
      filter.catch(new BadRequestException('malformed'), hostFor(captured));

      expect(captured.body).toEqual({
        errorCode: ErrorCode.VALIDATION_ERROR,
        errorMessage: 'Bad Request',
      });
    });
  });

  describe('Given:a framework HTTP exception, When:it reaches the filter', () => {
    it('should keep the status and derive the code from it', () => {
      filter.catch(new NotFoundException('Cannot GET /api/v1/nope'), hostFor(captured));

      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body?.errorCode).toBe(40400);
    });

    it('should replace the framework message with the standard reason phrase', () => {
      filter.catch(new NotFoundException('Cannot GET /api/v1/nope'), hostFor(captured));

      expect(captured.body?.errorMessage).toBe('Not Found');
    });

    it('should map a throttler rejection to THROTTLED', () => {
      filter.catch(
        new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
        hostFor(captured),
      );

      expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(captured.body?.errorCode).toBe(ErrorCode.THROTTLED);
    });
  });

  describe('Given:an unrecognized error such as a driver failure, When:it reaches the filter', () => {
    const driverFailure = (): Error =>
      new Error(
        'duplicate key value violates unique constraint "uq_users_email" — INSERT INTO "users"',
      );

    it('should answer 500 with the fixed generic envelope', () => {
      filter.catch(driverFailure(), hostFor(captured));

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body).toEqual({
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorMessage: 'Internal server error',
      });
    });

    it('should leak no part of the original message', () => {
      filter.catch(driverFailure(), hostFor(captured));

      expect(JSON.stringify(captured.body)).not.toMatch(/users|constraint|INSERT/);
    });

    it('should log the original error at error level, keyed by request id', () => {
      filter.catch(driverFailure(), hostFor(captured));

      expect(logs[0]?.level).toBe('error');
      expect(logs[0]?.record).toMatchObject({
        requestId: 'req-42',
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorCodeName: 'INTERNAL_ERROR',
      });
      expect((logs[0]?.record.error as { message: string }).message).toContain('uq_users_email');
    });
  });

  describe('Given:no request id was assigned, When:the request carries the header', () => {
    it('should fall back to the x-request-id header', () => {
      const request = { method: 'GET', url: '/api/v1/users', headers: { 'x-request-id': 'hdr-7' } };

      filter.catch(new NotFoundException(), hostFor(captured, request));

      expect(logs[0]?.record.requestId).toBe('hdr-7');
    });

    it('should log without a request id when neither is present', () => {
      filter.catch(new NotFoundException(), hostFor(captured, { method: 'GET', url: '/x' }));

      expect(logs[0]?.record.requestId).toBeUndefined();
    });
  });
});
