import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { RealtimeGateway } from './realtime.gateway';
import { realtimeRedisAdapterProvider } from './redis-adapter.provider';

/**
 * `MetricsModule` is imported (not just referenced) because the gateway
 * injects the socket-connections gauge it exports by token — the instrument
 * itself was registered ahead of this module existing, precisely so this is
 * the only change `MetricsModule` needed.
 */
@Module({
  imports: [MetricsModule],
  providers: [RealtimeGateway, realtimeRedisAdapterProvider],
})
export class RealtimeModule {}
