import Redis from 'ioredis';
import type { Provider } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app.config';

/** DI token for the single shared Redis connection (throttler storage today; realtime fan-out later). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Redis => new Redis(config.redisUrl),
};
