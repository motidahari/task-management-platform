import { Global, Module, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { UserEntity } from '../../src/domain/entities/user.entity';
import { APP_CONFIG, type AppConfig } from '../../src/infrastructure/config/app.config';
import { DatabaseModule, READ_CONNECTION } from '../../src/infrastructure/database/database.module';
import { configureApp } from '../../src/infrastructure/http/configure-app';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis-client.provider';
import { REALTIME_REDIS_ADAPTER } from '../../src/realtime/redis-adapter.provider';
import { buildTestUser } from '../integration/support/test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TestDatabase,
} from '../integration/support/test-database';

/**
 * Runs only against a real Postgres instance reachable at `DB_URL` — same
 * convention every other database-backed suite in this service uses. A real,
 * connected Postgres DataSource is kept (rather than faking query responses)
 * because a full status-change walk exercises row locks and transactional
 * writes only Postgres can actually answer.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

interface TaskResponse {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly statusName: string;
  readonly isClosed: boolean;
  readonly assignedUserId: string;
  readonly customFields: Record<string, unknown>;
}

interface HistoryEntryResponse {
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly assignedUserId: string;
  readonly fieldsSnapshot: Record<string, unknown>;
}

interface HistoryPageResponse {
  readonly items: readonly HistoryEntryResponse[];
  readonly nextCursor: string | null;
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
  'Task lifecycle, Given:the app is running against a reachable Postgres instance',
  () => {
    let testDatabase: TestDatabase;
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
      testDatabase = await setupTestDatabase();

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

    afterEach(async () => {
      await testDatabase.cleanup();
    });

    afterAll(async () => {
      await app.close();
      await testDatabase.teardown();
    });

    async function createUser(): Promise<string> {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());

      return user.id;
    }

    async function createTask(type: string, assignedUserId: string): Promise<TaskResponse> {
      const response = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ type, assignedUserId })
        .expect(201);

      return response.body as TaskResponse;
    }

    async function changeStatus(
      taskId: string,
      body: {
        direction: 'forward' | 'backward';
        expectedStatus: number;
        nextAssignedUserId: string;
        customFields?: Record<string, unknown>;
      },
    ): Promise<TaskResponse> {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/status`)
        .send(body)
        .expect(200);

      return response.body as TaskResponse;
    }

    async function closeTask(taskId: string): Promise<TaskResponse> {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${taskId}/close`)
        .expect(200);

      return response.body as TaskResponse;
    }

    async function getHistory(taskId: string): Promise<HistoryPageResponse> {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${taskId}/history`)
        .query({ limit: 100 })
        .expect(200);

      return response.body as HistoryPageResponse;
    }

    describe('When:a procurement task is created, advanced through every status, stepped backward, then closed', () => {
      it('should carry every transition through to the closed resource and record them in order in its history', async () => {
        const owner = await createUser();
        const reviewer = await createUser();

        const created = await createTask('procurement', owner);
        expect(created).toMatchObject({
          status: 1,
          statusName: 'created',
          isClosed: false,
          assignedUserId: owner,
          customFields: {},
        });

        const readBack = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${created.id}`)
          .expect(200);
        expect(readBack.body).toMatchObject({ id: created.id, status: 1 });

        const atOffers = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 1,
          nextAssignedUserId: reviewer,
          customFields: { quote1: '100 USD', quote2: '120 USD' },
        });
        expect(atOffers).toMatchObject({
          status: 2,
          statusName: 'supplier-offers-received',
          assignedUserId: reviewer,
          customFields: { quote1: '100 USD', quote2: '120 USD' },
        });

        const atPurchased = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 2,
          nextAssignedUserId: owner,
          customFields: { receipt: 'receipt-001' },
        });
        expect(atPurchased).toMatchObject({
          status: 3,
          statusName: 'purchase-completed',
          isClosed: false,
          assignedUserId: owner,
          customFields: { quote1: '100 USD', quote2: '120 USD', receipt: 'receipt-001' },
        });

        const steppedBack = await changeStatus(created.id, {
          direction: 'backward',
          expectedStatus: 3,
          nextAssignedUserId: reviewer,
        });
        expect(steppedBack).toMatchObject({
          status: 2,
          statusName: 'supplier-offers-received',
          assignedUserId: reviewer,
          // Backward moves ignore `customFields` — the prior snapshot survives untouched.
          customFields: atPurchased.customFields,
        });

        const atPurchasedAgain = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 2,
          nextAssignedUserId: owner,
          customFields: { receipt: 'receipt-002' },
        });
        expect(atPurchasedAgain).toMatchObject({
          status: 3,
          assignedUserId: owner,
          customFields: { quote1: '100 USD', quote2: '120 USD', receipt: 'receipt-002' },
        });

        const closed = await closeTask(created.id);
        expect(closed).toMatchObject({ status: 3, isClosed: true, assignedUserId: owner });

        const history = await getHistory(created.id);
        expect(
          history.items.map((entry) => ({
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
          })),
        ).toEqual([
          { fromStatus: null, toStatus: 1 },
          { fromStatus: 1, toStatus: 2 },
          { fromStatus: 2, toStatus: 3 },
          { fromStatus: 3, toStatus: 2 },
          { fromStatus: 2, toStatus: 3 },
          { fromStatus: 3, toStatus: null },
        ]);
        expect(history.items[1]).toMatchObject({
          fieldsSnapshot: { quote1: '100 USD', quote2: '120 USD' },
        });
        expect(history.items[5]).toMatchObject({ assignedUserId: owner, fieldsSnapshot: {} });
        expect(history.nextCursor).toBeNull();
      });
    });

    describe('When:a development task is created, advanced through every status, stepped backward, then closed', () => {
      it('should carry every transition through to the closed resource and record them in order in its history', async () => {
        const owner = await createUser();
        const reviewer = await createUser();

        const created = await createTask('development', owner);
        expect(created).toMatchObject({ status: 1, statusName: 'created', isClosed: false });

        const atSpecified = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 1,
          nextAssignedUserId: reviewer,
          customFields: { specification: 'Build the login flow' },
        });
        expect(atSpecified).toMatchObject({
          status: 2,
          statusName: 'specification-completed',
          customFields: { specification: 'Build the login flow' },
        });

        const atDeveloped = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 2,
          nextAssignedUserId: owner,
          customFields: { branchName: 'feature/login' },
        });
        expect(atDeveloped).toMatchObject({
          status: 3,
          statusName: 'development-completed',
          customFields: { specification: 'Build the login flow', branchName: 'feature/login' },
        });

        const atDistributed = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 3,
          nextAssignedUserId: reviewer,
          customFields: { versionNumber: '1.0.0' },
        });
        expect(atDistributed).toMatchObject({
          status: 4,
          statusName: 'distribution-completed',
          isClosed: false,
          customFields: {
            specification: 'Build the login flow',
            branchName: 'feature/login',
            versionNumber: '1.0.0',
          },
        });

        const steppedBack = await changeStatus(created.id, {
          direction: 'backward',
          expectedStatus: 4,
          nextAssignedUserId: owner,
        });
        expect(steppedBack).toMatchObject({
          status: 3,
          statusName: 'development-completed',
          customFields: atDistributed.customFields,
        });

        const atDistributedAgain = await changeStatus(created.id, {
          direction: 'forward',
          expectedStatus: 3,
          nextAssignedUserId: reviewer,
          customFields: { versionNumber: '1.0.1' },
        });
        expect(atDistributedAgain).toMatchObject({
          status: 4,
          customFields: {
            specification: 'Build the login flow',
            branchName: 'feature/login',
            versionNumber: '1.0.1',
          },
        });

        const closed = await closeTask(created.id);
        expect(closed).toMatchObject({ status: 4, isClosed: true });

        const history = await getHistory(created.id);
        expect(
          history.items.map((entry) => ({
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
          })),
        ).toEqual([
          { fromStatus: null, toStatus: 1 },
          { fromStatus: 1, toStatus: 2 },
          { fromStatus: 2, toStatus: 3 },
          { fromStatus: 3, toStatus: 4 },
          { fromStatus: 4, toStatus: 3 },
          { fromStatus: 3, toStatus: 4 },
          { fromStatus: 4, toStatus: null },
        ]);
        expect(history.nextCursor).toBeNull();
      });
    });
  },
);
