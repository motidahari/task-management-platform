import { STATUS_CODES } from 'node:http';

import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';

import { defaultErrorCodeForStatus, ErrorCode, errorCodeName } from '../error-codes';
import { isAppException } from '../errors/app-exception';
import type { ErrorResponse } from '../errors/error-response';
import { Logger } from '../logging/logger';

const INTERNAL_SERVER_ERROR = 500;
const BAD_REQUEST = 400;
const INTERNAL_ERROR_MESSAGE = 'Internal server error';

interface HttpRequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly id?: unknown;
  readonly headers?: Record<string, unknown>;
}

interface HttpResponseLike {
  status(statusCode: number): { json(body: unknown): unknown };
}

/**
 * The single place an exception becomes HTTP. Everything below throws and lets
 * the error bubble; nothing else catches, rewraps or logs it.
 *
 * The response is built **only** from our own typed exceptions' fields, or from
 * a fixed generic body — never from an unrecognized error's message. That is
 * what keeps SQL, constraint names, driver codes and stack traces out of
 * responses; the original error goes to the log, keyed by request id.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger = new Logger(HttpExceptionFilter.name)) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();

    const status = statusOf(exception);
    const body = this.toErrorResponse(exception, status);

    this.log(exception, request, status, body);
    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown, status: number): ErrorResponse {
    if (isAppException(exception)) {
      return {
        errorCode: exception.errorCode,
        errorMessage: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (!(exception instanceof HttpException)) {
      return { errorCode: ErrorCode.INTERNAL_ERROR, errorMessage: INTERNAL_ERROR_MESSAGE };
    }

    // A framework exception — most often the global ValidationPipe's 400. Its
    // status is trustworthy and its code derivable; its message is not ours to
    // forward, so a generic one is substituted.
    const validationMessages = status === BAD_REQUEST ? validationMessagesOf(exception) : null;

    return {
      errorCode: defaultErrorCodeForStatus(status),
      errorMessage: genericMessageFor(status),
      ...(validationMessages ? { details: { validation: validationMessages } } : {}),
    };
  }

  private log(
    exception: unknown,
    request: HttpRequestLike,
    status: number,
    body: ErrorResponse,
  ): void {
    const context = {
      requestId: requestIdOf(request),
      method: request.method,
      url: request.url,
      status,
      errorCode: body.errorCode,
      errorCodeName: errorCodeName(body.errorCode),
      error: exception,
    };

    if (status >= INTERNAL_SERVER_ERROR) {
      this.logger.error('Request failed', context);
      return;
    }

    this.logger.warn('Request rejected', context);
  }
}

function statusOf(exception: unknown): number {
  return exception instanceof HttpException ? exception.getStatus() : INTERNAL_SERVER_ERROR;
}

/**
 * The standard reason phrase — accurate, and it describes the HTTP outcome only,
 * so it can never carry an internal detail. HTTP 500 is pinned to the exact
 * string the API contract publishes, so the handled and unhandled paths agree.
 */
function genericMessageFor(status: number): string {
  if (status === INTERNAL_SERVER_ERROR) {
    return INTERNAL_ERROR_MESSAGE;
  }

  return STATUS_CODES[status] ?? 'Request failed';
}

/** class-validator reports one message per failed constraint; anything else is not ours to forward. */
function validationMessagesOf(exception: HttpException): readonly string[] | null {
  const payload: unknown = exception.getResponse();

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { message } = payload as { message?: unknown };

  return isStringArray(message) ? message : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function requestIdOf(request: HttpRequestLike): string | undefined {
  if (typeof request.id === 'string') {
    return request.id;
  }

  const header = request.headers?.['x-request-id'];

  return typeof header === 'string' ? header : undefined;
}
