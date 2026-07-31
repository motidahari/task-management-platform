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
import { REALTIME_REDIS_ADAPTER } from '../../src/realtime/redis-adapter.provider';

const ALLOWED_ORIGIN = 'http://allowed.example.com';
const DISALLOWED_ORIGIN = 'http://not-allowed.example.com';

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
  corsOrigins: [ALLOWED_ORIGIN],
  throttle: { ttlSec: 60, limit: 100 },
  realtime: { maxConnections: 1000 },
};

/**
 * Answers the readiness probe (`SELECT 1`) with a trivial row and the task
 * type registry's persisted-types check with no rows — an empty `tasks`
 * table is always a subset of the registry, so bootstrap never fails here.
 */
const fakeDataSource = {
  query: jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('DISTINCT type')) {
      return Promise.resolve([]);
    }

    return Promise.resolve([{ '?column?': 1 }]);
  }),
} as unknown as DataSource;

/**
 * Swaps in for the real `DatabaseModule` rather than overriding its
 * DataSource provider in place — `TypeOrmModule.forRootAsync` wires up its
 * own internal shutdown hook that expects to resolve the DataSource from
 * exactly the module it registered it in, which an in-place provider
 * override does not satisfy. Replacing the whole module sidesteps that
 * entirely: no real TypeORM machinery, so nothing to shut down. Marked
 * `@Global()` because the real `TypeOrmCoreModule` it replaces is global too
 * — that is how `HealthService` resolves `DataSource` without `HealthModule`
 * importing the database module directly.
 */
@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: fakeDataSource },
    { provide: getDataSourceToken(READ_CONNECTION), useValue: fakeDataSource },
  ],
  exports: [getDataSourceToken(), getDataSourceToken(READ_CONNECTION)],
})
class FakeDatabaseModule {}

/**
 * Stands in for the Redis connection the global `ThrottlerGuard` calls on
 * every request. `ThrottlerStorageRedisService` only accepts a genuine
 * `ioredis` instance (an `instanceof` check, not duck typing) — built via
 * `Object.create(Redis.prototype)` so the check passes without the
 * constructor ever opening a real socket. Answers "first hit, nowhere near
 * the limit" so the guard lets every test request through.
 */
const fakeRedisClient: Redis = Object.assign(Object.create(Redis.prototype) as Redis, {
  call: jest.fn().mockResolvedValue([1, 60_000, 0, 0]),
  quit: jest.fn().mockResolvedValue('OK'),
});

/**
 * The realtime gateway otherwise opens two real `ioredis` connections of its
 * own (pub/sub, distinct from `REDIS_CLIENT`) on every boot — a plain stand-in
 * for its `adapterConstructor` output keeps this suite off live Redis too.
 * Socket.IO instantiates this per namespace and awaits `init()`, so the fake
 * needs that one method to satisfy the namespace's own bootstrap, not just
 * the shape of `RealtimeRedisAdapterFactory`.
 */
class FakeSocketIoAdapter {
  init(): void {}
}

const fakeRealtimeRedisAdapter = { adapterConstructor: FakeSocketIoAdapter };

/** Boots the real `AppModule` wiring with the DB and Redis connections swapped for fakes — no live Postgres or Redis. */
async function bootTestApp(config: AppConfig): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideModule(DatabaseModule)
    .useModule(FakeDatabaseModule)
    .overrideProvider(REDIS_CLIENT)
    .useValue(fakeRedisClient)
    .overrideProvider(REALTIME_REDIS_ADAPTER)
    .useValue(fakeRealtimeRedisAdapter)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();

  configureApp(app, config);
  await app.init();

  return app;
}

describe('Bootstrap wiring, Given:the app is running with fake DB and Redis connections', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootTestApp(BASE_CONFIG);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('When:the compose healthcheck path is requested', () => {
    it('should answer 200 at the bare /health path', async () => {
      await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    });

    it('should not be reachable under the /api/v1 prefix', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });
  });

  describe('When:any response comes back', () => {
    it('should carry helmet security headers', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should not reveal the framework via X-Powered-By', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should echo a request id on the response', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    });
  });

  describe('When:the request carries an Origin header', () => {
    it('should grant CORS to an allowlisted origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('should not grant CORS to an origin outside the allowlist', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', DISALLOWED_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('When:the request body is within the 100kb limit', () => {
    it('should be parsed and reach routing (a 404 here means it was not rejected as too large)', async () => {
      const smallBody = { note: 'x'.repeat(1024) };

      await request(app.getHttpServer()).post('/health').send(smallBody).expect(404);
    });
  });

  describe('When:the request body exceeds the 100kb limit', () => {
    it('should be rejected with 413 before reaching any route', async () => {
      const oversizedBody = { note: 'x'.repeat(200 * 1024) };

      await request(app.getHttpServer()).post('/health').send(oversizedBody).expect(413);
    });
  });

  describe('When:the environment is not production', () => {
    it('should serve the Swagger UI at /docs', async () => {
      await request(app.getHttpServer()).get('/docs').expect(200);
    });
  });
});

describe('Bootstrap wiring, Given:the app is running in production', () => {
  let productionApp: NestExpressApplication;

  beforeAll(async () => {
    productionApp = await bootTestApp({
      ...BASE_CONFIG,
      nodeEnv: 'production',
      isProduction: true,
    });
  });

  afterAll(async () => {
    await productionApp.close();
  });

  it('should not serve /docs', async () => {
    await request(productionApp.getHttpServer()).get('/docs').expect(404);
  });
});
