import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from './redis-client.provider';

/**
 * Nest only knows about the Redis connection this service owns because it is
 * a real provider (`REDIS_CLIENT`) — that is what makes this hook run when
 * the app drains, closing the socket instead of leaving it open past process
 * shutdown.
 */
@Injectable()
export class RedisShutdownService implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
