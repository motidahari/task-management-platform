import { Logger } from '@core/shared';
import { Inject, Injectable, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';

import { APP_CONFIG, type AppConfig } from '../infrastructure/config/app.config';
import { createRedisClient } from '../infrastructure/redis/redis-client.provider';

/** DI token for {@link RealtimeRedisAdapterFactory} — inject this, never construct the class. */
export const REALTIME_REDIS_ADAPTER = Symbol('REALTIME_REDIS_ADAPTER');

export type RealtimeAdapterConstructor = ReturnType<typeof createAdapter>;

/**
 * With N app replicas behind the load balancer, a client's socket lives on
 * ONE instance while the event that concerns it may be emitted from another.
 * This wires Socket.IO's Redis adapter so every instance forwards emits
 * through Redis pub/sub and delivers to its own local sockets — without it,
 * fan-out silently only works single-instance.
 *
 * Redis requires a dedicated connection for subscribing (a subscribed
 * connection can only issue subscribe/unsubscribe commands), so this opens
 * two connections of its own rather than reusing the shared `REDIS_CLIENT`
 * the throttler storage depends on.
 */
@Injectable()
export class RealtimeRedisAdapterFactory implements OnApplicationShutdown {
  private readonly pubClient: Redis;
  private readonly subClient: Redis;
  readonly adapterConstructor: RealtimeAdapterConstructor;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const logger = new Logger(RealtimeRedisAdapterFactory.name);

    this.pubClient = createRedisClient(config.redisUrl, logger);
    this.subClient = this.pubClient.duplicate();
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
  }
}

export const realtimeRedisAdapterProvider: Provider = {
  provide: REALTIME_REDIS_ADAPTER,
  useClass: RealtimeRedisAdapterFactory,
};
