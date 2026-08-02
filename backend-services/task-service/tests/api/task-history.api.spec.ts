import { randomUUID } from 'node:crypto';

import { Global, Module, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { TaskStatusHistoryEntity } from '../../src/domain/entities/task-status-history.entity';
import { TaskEntity } from '../../src/domain/entities/task.entity';
import { UserEntity } from '../../src/domain/entities/user.entity';
import { APP_CONFIG, type AppConfig } from '../../src/infrastructure/config/app.config';
import { DatabaseModule, READ_CONNECTION } from '../../src/infrastructure/database/database.module';
import { configureApp } from '../../src/infrastructure/http/configure-app';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis-client.provider';
import { REALTIME_REDIS_ADAPTER } from '../../src/realtime/redis-adapter.provider';
import {
  buildTestHistoryEntry,
  buildTestTask,
  buildTestUser,
} from '../integration/support/test-data-builders';
import { isTestDatabaseConfigured, useTestDatabase } from '../integration/support/test-database';

/**
 * Runs only against a real Postgres instance reachable at `DB_URL` — same
 * convention every other database-backed suite in this service uses. Unlike
 * the other API suites, this one keeps a real, connected Postgres DataSource
 * (pointed at the same test database `setupTestDatabase` already migrated)
 * rather than faking query responses: the endpoint's whole point is a
 * keyset query only Postgres can actually answer.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

interface HistoryEntryResponse {
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly assignedUserId: string;
  readonly fieldsSnapshot: Record<string, unknown>;
  readonly createdAt: string;
}

interface HistoryPageResponse {
  readonly items: readonly HistoryEntryResponse[];
  readonly nextCursor: string | null;
  readonly limit: number;
}

/**
 * Stands in for `DatabaseModule`, wiring both connections to the one
 * already-migrated `DataSource` the suite seeds through directly — same
 * rationale as every other API suite's `FakeDatabaseModule` (see
 * `bootstrap.api.spec.ts`): replacing the whole module, rather than
 * overriding the `DataSource` provider in place, is what lets `app.close()`
 * tear down cleanly instead of `TypeOrmCoreModule`'s own shutdown hook
 * failing to resolve a `DataSource` it never registered. Built as a factory
 * (not a static class) because the real `DataSource` only exists once
 * `setupTestDatabase()` has resolved.
 */
function buildRealDatabaseModule(dataSource: DataSource): Type<unknown> {
  @Global()
  @Module({
    providers: [
      { provide: getDataSourceToken(), useValue: dataSource },
      { provide: getDataSourceToken(READ_CONNECTION), useValue: dataSource },
    ],
    exports: [getDataSourceToken(), getDataSourceToken(READ_CONNECTION)],
  })
  class RealDatabaseModule {}

  return RealDatabaseModule;
}

describeAgainstRealDatabase(
  'Task history endpoint, Given:the app is running against a reachable Postgres instance',
  () => {
    const testDatabase = useTestDatabase();
    let app: NestExpressApplication;

    const databaseUrl = process.env.DB_URL ?? '';

    const BASE_CONFIG: AppConfig = {
      nodeEnv: 'test',
      isProduction: false,
      port: 3000,
      database: {
        writeUrl: databaseUrl,
        readUrl: databaseUrl,
        poolSize: 10,
        statementTimeoutMs: 5000,
        lockTimeoutMs: 2000,
      },
      redisUrl: 'redis://localhost:6379',
      corsOrigins: ['http://allowed.example.com'],
      throttle: { ttlSec: 60, limit: 1000 },
      realtime: { maxConnections: 1000 },
    };

    /**
     * Same rationale as the other API suites: `ThrottlerStorageRedisService`
     * only accepts a genuine `ioredis` instance, built here without opening a
     * real socket, answering "first hit, nowhere near the limit" so the guard
     * lets every test request through.
     */
    const fakeRedisClient: Redis = Object.assign(Object.create(Redis.prototype) as Redis, {
      call: jest.fn().mockResolvedValue([1, 60_000, 0, 0]),
      quit: jest.fn().mockResolvedValue('OK'),
    });

    class FakeSocketIoAdapter {
      init(): void {}
    }

    const fakeRealtimeRedisAdapter = { adapterConstructor: FakeSocketIoAdapter };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_CONFIG)
        .useValue(BASE_CONFIG)
        .overrideModule(DatabaseModule)
        .useModule(buildRealDatabaseModule(testDatabase.dataSource))
        .overrideProvider(REDIS_CLIENT)
        .useValue(fakeRedisClient)
        .overrideProvider(REALTIME_REDIS_ADAPTER)
        .useValue(fakeRealtimeRedisAdapter)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app, BASE_CONFIG);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    /**
     * A timestamp guaranteed to fall inside the current month's partition,
     * whatever day the suite runs on, and — unlike the DB's own `now()`
     * default — carries no sub-millisecond component: `created_at` round-trips
     * through a plain JS `Date` (millisecond precision) at the HTTP boundary,
     * so a seed timestamp with microseconds a real client could never observe
     * would make the cursor assertions below flaky for a reason this suite
     * has no interest in covering.
     */
    function withinCurrentPartition(offsetMs: number): Date {
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      return new Date(startOfMonth.getTime() + offsetMs);
    }

    async function createTaskWithThreeTransitions(): Promise<{ taskId: string }> {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
      const historyRepository = testDatabase.dataSource.getRepository(TaskStatusHistoryEntity);

      const user = await userRepository.save(buildTestUser());
      const task = await taskRepository.save(buildTestTask(user.id));

      await historyRepository.save(
        buildTestHistoryEntry(task.id, user.id, {
          fromStatus: null,
          toStatus: 1,
          createdAt: withinCurrentPartition(0),
        }),
      );
      await historyRepository.save(
        buildTestHistoryEntry(task.id, user.id, {
          fromStatus: 1,
          toStatus: 2,
          createdAt: withinCurrentPartition(1000),
        }),
      );
      await historyRepository.save(
        buildTestHistoryEntry(task.id, user.id, {
          fromStatus: 2,
          toStatus: 3,
          createdAt: withinCurrentPartition(2000),
        }),
      );

      return { taskId: task.id };
    }

    describe("When:a client pages through an existing task's history with a small limit", () => {
      it('should answer 200 with the transitions oldest-first and a nextCursor that reaches the rest', async () => {
        const { taskId } = await createTaskWithThreeTransitions();

        const firstResponse = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${taskId}/history`)
          .query({ limit: 2 })
          .expect(200);
        const firstPage = firstResponse.body as HistoryPageResponse;

        expect(firstPage.items).toEqual([
          expect.objectContaining({ fromStatus: null, toStatus: 1 }),
          expect.objectContaining({ fromStatus: 1, toStatus: 2 }),
        ]);
        expect(firstPage.limit).toBe(2);
        expect(typeof firstPage.nextCursor).toBe('string');

        const secondResponse = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${taskId}/history`)
          .query({ limit: 2, cursor: firstPage.nextCursor ?? '' })
          .expect(200);
        const secondPage = secondResponse.body as HistoryPageResponse;

        expect(secondPage.items).toEqual([expect.objectContaining({ fromStatus: 2, toStatus: 3 })]);
        expect(secondPage.nextCursor).toBeNull();
      });
    });

    describe('When:a client requests history for a task id that does not exist', () => {
      it('should answer 404 TASK_NOT_FOUND', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${randomUUID()}/history`)
          .expect(404);

        expect(response.body).toMatchObject({ errorCode: 40400 });
      });
    });

    describe('When:a client sends a cursor that is not valid base64-encoded JSON', () => {
      it('should answer 400 VALIDATION_ERROR rather than reach the database with it', async () => {
        const { taskId } = await createTaskWithThreeTransitions();

        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${taskId}/history`)
          .query({ cursor: 'not-a-valid-cursor' })
          .expect(400);

        expect(response.body).toMatchObject({ errorCode: 40000 });
      });
    });
  },
);
