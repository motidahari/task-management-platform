import {
  ErrorCode,
  type ErrorResponse,
  HttpExceptionFilter,
  Logger,
  type LogSink,
} from '@core/shared';
import { type ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

/**
 * `ThrottlerException` (from `@nestjs/throttler`, the library this service
 * actually throws on a rate-limit rejection) is a plain `HttpException` with
 * no `errorCode` of its own. The shared `HttpExceptionFilter`'s generic
 * status-to-code mapping is what turns its 429 into `errorCode: 42900`; this
 * test pins that specific exception class to that specific code so a future
 * change to either side breaks a test here first.
 */
describe('HttpExceptionFilter, Given:a ThrottlerException raised by the global ThrottlerGuard', () => {
  it('should map the 429 rejection to errorCode 42900 (THROTTLED)', () => {
    const sink: LogSink = () => {};
    const filter = new HttpExceptionFilter(new Logger('HttpExceptionFilter', sink));
    let captured: { status?: number; body?: ErrorResponse } = {};

    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/api/v1/tasks', headers: {} }),
        getResponse: () => ({
          status(statusCode: number) {
            captured = { ...captured, status: statusCode };

            return {
              json(body: unknown) {
                captured = { ...captured, body: body as ErrorResponse };
              },
            };
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new ThrottlerException(), host);

    expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(captured.body).toEqual({
      errorCode: ErrorCode.THROTTLED,
      errorMessage: 'Too Many Requests',
    });
  });
});
