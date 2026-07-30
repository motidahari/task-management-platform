import { randomUUID } from 'node:crypto';

import { Logger } from '@core/shared';
import type { NextFunction, Request, Response } from 'express';

import { routePathOf } from './route-path.util';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_MAX_LENGTH = 128;
/** Safe for both a log line and an outgoing HTTP header value — no control characters, no separators. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

interface RequestWithId extends Request {
  id?: string;
}

/**
 * Functional middleware (not a Nest-DI class) so it can be unit tested by
 * calling the returned function directly, and so the `Logger` it writes
 * through can be swapped for a capturing sink in tests exactly like
 * `HttpExceptionFilter` does.
 *
 * Stamps every request with a request id — reusing the caller's
 * `x-request-id` when present, generating one otherwise — puts it on `req.id`
 * (the shape `HttpExceptionFilter#requestIdOf` reads), echoes it on the
 * response, and logs one structured line per completed request.
 */
export function requestContextMiddleware(
  logger: Logger = new Logger('HttpRequest'),
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: RequestWithId, res: Response, next: NextFunction): void => {
    const requestId = incomingRequestId(req) ?? randomUUID();
    const startedAt = Date.now();

    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    res.on('finish', () => {
      logger.info('Request completed', {
        requestId,
        method: req.method,
        route: routePathOf(req),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}

function incomingRequestId(req: Request): string | undefined {
  const header = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  return trimmed && isSafeRequestId(trimmed) ? trimmed : undefined;
}

/**
 * A client-supplied id is trusted only if it is short and made of characters
 * that are safe to both echo back on a response header and write verbatim
 * into a log line — anything else falls back to a generated id instead of
 * being rejected outright, so a malformed header never fails the request.
 */
function isSafeRequestId(value: string): boolean {
  return value.length <= REQUEST_ID_MAX_LENGTH && REQUEST_ID_PATTERN.test(value);
}
