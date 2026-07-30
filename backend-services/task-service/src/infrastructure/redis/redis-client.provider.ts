import { Logger } from '@core/shared';
import type { Provider } from '@nestjs/common';
import Redis from 'ioredis';

import { APP_CONFIG, type AppConfig } from '../config/app.config';

/** DI token for the single shared Redis connection (throttler storage today; realtime fan-out later). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * ioredis reconnects on its own, emitting an `error` for every failed attempt;
 * with no listener attached each one surfaces as an unhandled-error stack
 * trace, so a Redis that is merely still starting up floods the log. Attaching
 * a handler both prevents that and collapses a whole outage into a single
 * line, reset once the connection recovers.
 */
export function createRedisClient(
  redisUrl: string,
  logger: Logger = new Logger('RedisClient'),
): Redis {
  const client = new Redis(redisUrl);
  let outageLogged = false;

  client.on('error', (error: Error) => {
    if (outageLogged) {
      return;
    }
    outageLogged = true;
    logger.error('Redis connection error — retrying in the background', { error: error.message });
  });

  client.on('ready', () => {
    if (outageLogged) {
      logger.info('Redis connection restored');
    }
    outageLogged = false;
  });

  return client;
}

export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Redis => createRedisClient(config.redisUrl),
};
