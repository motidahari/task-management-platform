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
import type { StatusDefinition } from '../../src/task-type/interfaces/task-type-definition.interface';

interface TaskTypeMetadataResponse {
  readonly type: string;
  readonly displayName: string;
  readonly finalStatus: number;
  readonly statuses: readonly StatusDefinition[];
}

/** Narrows `find`'s result so assertions below read the found type's fields directly, instead of on a possibly-undefined value. */
function findTaskType(
  taskTypes: readonly TaskTypeMetadataResponse[],
  type: string,
): TaskTypeMetadataResponse {
  const taskType = taskTypes.find((candidate) => candidate.type === type);

  if (!taskType) {
    throw new Error(`Expected task type "${type}" in the response body`);
  }

  return taskType;
}

describe('Task types endpoint', () => {
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

  /**
   * Same rationale as `bootstrap.api.spec.ts` — keeps the realtime gateway off
   * live Redis too. Socket.IO instantiates this per namespace and awaits
   * `init()`, so the fake needs that one method to satisfy the namespace's own
   * bootstrap, not just the shape of `RealtimeRedisAdapterFactory`.
   */
  class FakeSocketIoAdapter {
    init(): void {}
  }

  const fakeRealtimeRedisAdapter = { adapterConstructor: FakeSocketIoAdapter };

  async function bootTestApp(): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(BASE_CONFIG)
      .overrideModule(DatabaseModule)
      .useModule(FakeDatabaseModule)
      .overrideProvider(REDIS_CLIENT)
      .useValue(fakeRedisClient)
      .overrideProvider(REALTIME_REDIS_ADAPTER)
      .useValue(fakeRealtimeRedisAdapter)
      .compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();

    configureApp(app, BASE_CONFIG);
    await app.init();

    return app;
  }

  describe('Given:the app is running with fake DB and Redis connections', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await bootTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('When:a client requests the registered task types', () => {
      it('should answer 200 with every registered type and its server-derived finalStatus', async () => {
        const response = await request(app.getHttpServer()).get('/api/v1/task-types').expect(200);
        const taskTypes = response.body as TaskTypeMetadataResponse[];

        const procurement = findTaskType(taskTypes, 'procurement');
        const development = findTaskType(taskTypes, 'development');

        expect(taskTypes).toHaveLength(2);

        expect(procurement).toMatchObject({
          type: 'procurement',
          displayName: 'Procurement',
          finalStatus: 3,
        });
        expect(procurement.statuses).toHaveLength(3);
        expect(procurement.statuses[1]).toMatchObject({
          status: 2,
          name: 'supplier-offers-received',
          requiredFields: [
            { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 500 },
            { key: 'quote2', label: 'Price quote 2', fieldType: 'string', maxLength: 500 },
          ],
        });

        expect(development).toMatchObject({
          type: 'development',
          displayName: 'Development',
          finalStatus: 4,
        });
        expect(development.statuses).toHaveLength(4);
      });

      it('should set Cache-Control: no-cache rather than a max-age window', async () => {
        const response = await request(app.getHttpServer()).get('/api/v1/task-types').expect(200);

        expect(response.headers['cache-control']).toBe('no-cache');
      });

      it('should carry an ETag over the response body', async () => {
        const response = await request(app.getHttpServer()).get('/api/v1/task-types').expect(200);

        expect(response.headers.etag).toEqual(expect.any(String));
      });
    });

    describe('When:a client revalidates with the ETag it was given', () => {
      it('should answer 304 with an empty body instead of re-sending the payload', async () => {
        const firstResponse = await request(app.getHttpServer())
          .get('/api/v1/task-types')
          .expect(200);
        const etag = firstResponse.headers.etag as string;

        const revalidationResponse = await request(app.getHttpServer())
          .get('/api/v1/task-types')
          .set('If-None-Match', etag)
          .expect(304);

        expect(revalidationResponse.text).toBe('');
      });
    });

    describe('When:a client sends a stale ETag', () => {
      it('should answer 200 with the current payload', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/task-types')
          .set('If-None-Match', '"stale-etag-value"')
          .expect(200);
      });
    });
  });
});
