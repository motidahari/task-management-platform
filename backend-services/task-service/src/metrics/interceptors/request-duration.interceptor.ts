import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Request, Response } from 'express';
import type { Histogram } from 'prom-client';
import type { Observable } from 'rxjs';

import { routePathOf } from '../../infrastructure/http/route-path.util';
import { REQUEST_DURATION_HISTOGRAM_NAME } from '../metrics.constants';

const METRICS_SCRAPE_PATH = '/metrics';

/**
 * Registered globally so every route gets exactly one observation per
 * request. Listens for the response's `finish` event, the same signal
 * `requestContextMiddleware` logs on, rather than the interceptor's own
 * RxJS pipeline completing — the status code Nest's exception filter sets
 * for an error response is only final once the response has actually been
 * written. Skips the metrics scrape itself: a scraper observing its own
 * scrape would double-count and add no signal.
 */
@Injectable()
export class RequestDurationInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(REQUEST_DURATION_HISTOGRAM_NAME)
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();

    if (request.originalUrl === METRICS_SCRAPE_PATH) {
      return next.handle();
    }

    const response = httpContext.getResponse<Response>();
    const stopTimer = this.requestDuration.startTimer({ method: request.method });

    response.on('finish', () => {
      stopTimer({ route: routePathOf(request), status_code: String(response.statusCode) });
    });

    return next.handle();
  }
}
