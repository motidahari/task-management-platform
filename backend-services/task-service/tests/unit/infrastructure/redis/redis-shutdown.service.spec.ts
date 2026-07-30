import type Redis from 'ioredis';

import { RedisShutdownService } from '../../../../src/infrastructure/redis/redis-shutdown.service';

describe('RedisShutdownService', () => {
  describe('Given:the application is shutting down, When:the shutdown hook runs', () => {
    it('should close the Redis connection it owns', async () => {
      const quit = jest.fn().mockResolvedValue('OK');
      const service = new RedisShutdownService({ quit } as unknown as Redis);

      await service.onApplicationShutdown();

      expect(quit).toHaveBeenCalledTimes(1);
    });
  });
});
