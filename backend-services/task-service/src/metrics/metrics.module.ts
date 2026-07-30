import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { getToken, PrometheusModule } from '@willsoto/nestjs-prometheus';

import { RequestDurationInterceptor } from './interceptors/request-duration.interceptor';
import { MetricsController } from './metrics.controller';
import {
  REALTIME_EVENTS_PUBLISHED_COUNTER_NAME,
  SOCKET_CONNECTIONS_GAUGE_NAME,
} from './metrics.constants';
import { dbPoolConnectionsGaugeProvider } from './providers/db-pool-gauge.provider';
import {
  realtimeEventsPublishedCounterProvider,
  socketConnectionsGaugeProvider,
} from './providers/realtime-instruments.provider';
import { requestDurationHistogramProvider } from './providers/request-duration-histogram.provider';

const METRICS_PATH = 'metrics';

/**
 * `PrometheusModule` mounts `MetricsController` as an ordinary Nest
 * controller, so `setGlobalPrefix` in `configure-app.ts` would otherwise
 * catch it under `/api/v1` like any other route — it is excluded there to
 * keep the scrape target at the bare `/metrics` path scrapers expect.
 *
 * The socket-connections gauge and realtime-events counter are exported by
 * token so the realtime module (not built yet) can inject them once it
 * exists, without this module changing.
 */
@Module({
  imports: [PrometheusModule.register({ controller: MetricsController, path: METRICS_PATH })],
  providers: [
    requestDurationHistogramProvider,
    dbPoolConnectionsGaugeProvider,
    socketConnectionsGaugeProvider,
    realtimeEventsPublishedCounterProvider,
    { provide: APP_INTERCEPTOR, useClass: RequestDurationInterceptor },
  ],
  exports: [
    getToken(SOCKET_CONNECTIONS_GAUGE_NAME),
    getToken(REALTIME_EVENTS_PUBLISHED_COUNTER_NAME),
  ],
})
export class MetricsModule {}
