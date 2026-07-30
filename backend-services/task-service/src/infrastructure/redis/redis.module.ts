import { Global, Module } from '@nestjs/common';

import { REDIS_CLIENT, redisClientProvider } from './redis-client.provider';
import { RedisShutdownService } from './redis-shutdown.service';

@Global()
@Module({
  providers: [redisClientProvider, RedisShutdownService],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
