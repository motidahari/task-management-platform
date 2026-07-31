import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { EMPTY, type Observable, of, switchMap } from 'rxjs';

import {
  applyConditionalGet,
  type ConditionalGetRequestLike,
  type ConditionalGetResponseLike,
} from './conditional-get';

/**
 * Applies {@link applyConditionalGet} around whatever the handler returns,
 * so a controller stays pure delegation — it returns its body like any other
 * handler and never touches caching, headers, or the raw response.
 *
 * The handler still has to run before a decision is possible: the ETag is
 * derived from its returned body, so this only ever short-circuits the
 * *response*, never the handler call itself. When the body already matches
 * the client's `If-None-Match`, `applyConditionalGet` has already written the
 * empty 304 itself, and this returns `EMPTY` so Nest's standard response
 * handling never attempts to send a second, conflicting response for the
 * same request.
 */
@Injectable()
export class ConditionalGetInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ConditionalGetRequestLike>();
    const response = http.getResponse<ConditionalGetResponseLike>();

    return next
      .handle()
      .pipe(
        switchMap((body: unknown) =>
          applyConditionalGet(request, response, body) ? EMPTY : of(body),
        ),
      );
  }
}

/** Shorthand for `@UseInterceptors(ConditionalGetInterceptor)` on a route handler. */
export function ConditionalGet(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseInterceptors(ConditionalGetInterceptor));
}
