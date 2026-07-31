import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { RealtimeGateway } from './realtime.gateway';
import { realtimeRedisAdapterProvider } from './redis-adapter.provider';
import { TaskEventsPublisher } from './task-events.publisher';

/**
 * `MetricsModule` is imported (not just referenced) because the gateway
 * injects the socket-connections gauge it exports by token — the instrument
 * itself was registered ahead of this module existing, precisely so this is
 * the only change `MetricsModule` needed.
 *
 * `TaskEventsPublisher` is exported so a future consumer (the task mutation
 * service) can import this module and inject it without reaching past the
 * module boundary into the gateway or its rooms.
 */
@Module({
  imports: [MetricsModule],
  providers: [RealtimeGateway, realtimeRedisAdapterProvider, TaskEventsPublisher],
  exports: [TaskEventsPublisher],
})
export class RealtimeModule {}
