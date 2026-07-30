import { Global, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { APP_CONFIG, type AppConfig } from '../../src/infrastructure/config/app.config';
import { DatabaseModule, READ_CONNECTION } from '../../src/infrastructure/database/database.module';
import { configureApp } from '../../src/infrastructure/http/configure-app';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis-client.provider';
import {
  DB_POOL_CONNECTIONS_GAUGE_NAME,
  REALTIME_EVENTS_PUBLISHED_COUNTER_NAME,
  REQUEST_DURATION_HISTOGRAM_NAME,
  SOCKET_CONNECTIONS_GAUGE_NAME,
} from '../../src/metrics/metrics.constants';

const BASE_CONFIG: AppConfig = {
  nodeEnv: 'test',
  isProduction: false,
  port: 3000,
  database: {
    writeUrl: 'postgres://user:pass@localhost:5432/testdb',
    readUrl: 'postgres://user:pass@localhost:5432/testdb',
    poolSize: 10,
    statementTimeoutMs: 5000,
    lockTimeoutMs: 2000,
  },
  redisUrl: 'redis://localhost:6379',
  corsOrigins: ['http://allowed.example.com'],
  throttle: { ttlSec: 60, limit: 100 },
};

const fakeDataSource = {
  query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
} as unknown as DataSource;

/** Same rationale as `bootstrap.api.spec.ts` — see that file for why the whole module is swapped instead of an in-place provider override. */
@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: fakeDataSource },
    { provide: getDataSourceToken(READ_CONNECTION), useValue: fakeDataSource },
  ],
  exports: [getDataSourceToken(), getDataSourceToken(READ_CONNECTION)],
})
class FakeDatabaseModule {}

const fakeRedisClient: Redis = Object.assign(Object.create(Redis.prototype) as Redis, {
  call: jest.fn().mockResolvedValue([1, 60_000, 0, 0]),
  quit: jest.fn().mockResolvedValue('OK'),
});

async function bootTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(BASE_CONFIG)
    .overrideModule(DatabaseModule)
    .useModule(FakeDatabaseModule)
    .overrideProvider(REDIS_CLIENT)
    .useValue(fakeRedisClient)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();

  configureApp(app, BASE_CONFIG);
  await app.init();

  return app;
}

describe('Metrics scrape endpoint, Given:the app is running with fake DB and Redis connections', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('When:a scraper requests /metrics', () => {
    it('should answer 200 with a prometheus text-exposition content type', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      expect(response.headers['content-type']).toEqual(expect.stringContaining('text/plain'));
      expect(response.headers['content-type']).toEqual(expect.stringContaining('version='));
    });

    it('should not be reachable under the /api/v1 prefix', async () => {
      await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
    });

    it('should expose the request-duration histogram, DB pool gauge and realtime instruments', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      expect(response.text).toEqual(expect.stringContaining(REQUEST_DURATION_HISTOGRAM_NAME));
      expect(response.text).toEqual(expect.stringContaining(DB_POOL_CONNECTIONS_GAUGE_NAME));
      expect(response.text).toEqual(expect.stringContaining(SOCKET_CONNECTIONS_GAUGE_NAME));
      expect(response.text).toEqual(
        expect.stringContaining(REALTIME_EVENTS_PUBLISHED_COUNTER_NAME),
      );
    });

    it('should record a request-duration observation for a request that already completed', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);

      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      expect(response.text).toEqual(
        expect.stringContaining(`${REQUEST_DURATION_HISTOGRAM_NAME}_count{method="GET"`),
      );
    });
  });
});
