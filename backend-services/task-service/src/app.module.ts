import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

import { HealthModule } from './health/health.module';
import { APP_CONFIG, type AppConfig } from './infrastructure/config/app.config';
import { AppConfigModule } from './infrastructure/config/app-config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { requestContextMiddleware } from './infrastructure/http/request-context.middleware';
import { REDIS_CLIENT } from './infrastructure/redis/redis-client.provider';
import { RedisModule } from './infrastructure/redis/redis.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    DatabaseModule,
    HealthModule,
    MetricsModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: Redis) => ({
        throttlers: [{ ttl: seconds(config.throttle.ttlSec), limit: config.throttle.limit }],
        // Backed by the shared Redis connection so the limit stays meaningful
        // across every replica and survives a redeploy instead of resetting
        // per instance.
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Express 5's router requires a named wildcard; '{*splat}' also matches
    // the root path (a bare '*splat' would not).
    consumer.apply(requestContextMiddleware()).forRoutes('{*splat}');
  }
}
