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
import { DevelopmentDefinition } from '../../src/task-type/definitions/development.definition';
import { ProcurementDefinition } from '../../src/task-type/definitions/procurement.definition';
import {
  ALL_TASK_TYPE_DEFINITIONS,
  type TaskTypeDefinition,
} from '../../src/task-type/interfaces/task-type-definition.interface';
import { buildTestUser } from '../integration/support/test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TestDatabase,
} from '../integration/support/test-database';

/** Runs only against a real Postgres instance reachable at `DB_URL` — same convention every other database-backed suite in this service uses. */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

/**
 * A throwaway task type that exists nowhere under `src/` — it is registered
 * into the running app purely by overriding `ALL_TASK_TYPE_DEFINITIONS`
 * below. Its shape mirrors `ProcurementDefinition`/`DevelopmentDefinition`
 * (an ordered, contiguous `statuses` list; `finalStatus` left undeclared,
 * derived by the registry) but exercises both discriminated field kinds the
 * production types don't combine on the same status list: a bounded string
 * on the way into status 2, a bounded number on the way into the final
 * status.
 */
class QaDefinition implements TaskTypeDefinition {
  readonly type = 'qa-verification';
  readonly displayName = 'QA Verification';
  readonly statuses = [
    { status: 1, name: 'created', displayName: 'Created', requiredFields: [] },
    {
      status: 2,
      name: 'triaged',
      displayName: 'Triaged',
      requiredFields: [
        { key: 'summary', label: 'Summary', fieldType: 'string' as const, maxLength: 40 },
      ],
    },
    {
      status: 3,
      name: 'verified',
      displayName: 'Verified',
      requiredFields: [
        { key: 'severity', label: 'Severity', fieldType: 'number' as const, min: 1, max: 5 },
      ],
    },
  ] as const;
}

interface TaskTypeMetadataResponse {
  readonly type: string;
  readonly displayName: string;
  readonly finalStatus: number;
}

interface TaskResponse {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly statusName: string;
  readonly isClosed: boolean;
  readonly customFields: Record<string, unknown>;
}

interface ErrorEnvelope {
  readonly errorCode: number;
  readonly errorMessage: string;
  readonly details?: { readonly missing?: readonly string[]; readonly invalid?: readonly string[] };
}

interface HistoryEntryResponse {
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly fieldsSnapshot: Record<string, unknown>;
}

interface HistoryPageResponse {
  readonly items: readonly HistoryEntryResponse[];
}

/**
 * Stands in for `DatabaseModule`, wiring both connections to the one
 * already-migrated `DataSource` the suite seeds through directly — same
 * rationale as `task-history.api.spec.ts`'s `buildRealDatabaseModule`.
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
  'Task type extensibility, Given:a throwaway task type registered only for this suite',
  () => {
    let testDatabase: TestDatabase;
    let app: NestExpressApplication;
    let assignedUserId: string;

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

      /**
       * The registration seam: `ALL_TASK_TYPE_DEFINITIONS` is the exact token
       * `TaskTypeRegistry` injects (`task-type.module.ts`), so overriding its
       * value is equivalent to appending a class to `TASK_TYPE_DEFINITION_CLASSES`
       * for this test process only — no file under `src/` changes. The two
       * production definitions are re-instantiated (they take no constructor
       * arguments, same as the real factory resolves them) so this override
       * adds `QaDefinition`, it does not replace the existing registry.
       */
      const definitionsWithQaType: TaskTypeDefinition[] = [
        new ProcurementDefinition(),
        new DevelopmentDefinition(),
        new QaDefinition(),
      ];

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_CONFIG)
        .useValue(BASE_CONFIG)
        .overrideModule(DatabaseModule)
        .useModule(buildRealDatabaseModule(testDatabase.dataSource))
        .overrideProvider(REDIS_CLIENT)
        .useValue(fakeRedisClient)
        .overrideProvider(REALTIME_REDIS_ADAPTER)
        .useValue(fakeRealtimeRedisAdapter)
        .overrideProvider(ALL_TASK_TYPE_DEFINITIONS)
        .useValue(definitionsWithQaType)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app, BASE_CONFIG);
      await app.init();
    });

    beforeEach(async () => {
      // Ahead of the fixture row below, which is itself one of the writes the
      // ledger has to undo.
      await testDatabase.openLedger();

      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());
      assignedUserId = user.id;
    });

    afterEach(async () => {
      await testDatabase.cleanup();
    });

    afterAll(async () => {
      await app.close();
      await testDatabase.teardown();
    });

    async function createQaTask(): Promise<TaskResponse> {
      const response = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ type: 'qa-verification', assignedUserId })
        .expect(201);

      return response.body as TaskResponse;
    }

    describe('When:a client requests the registered task types', () => {
      it('should list the throwaway type alongside the two existing ones, with a server-derived finalStatus', async () => {
        const response = await request(app.getHttpServer()).get('/api/v1/task-types').expect(200);
        const taskTypes = response.body as TaskTypeMetadataResponse[];

        const qaType = taskTypes.find((candidate) => candidate.type === 'qa-verification');

        expect(taskTypes).toHaveLength(3);
        expect(qaType).toMatchObject({
          type: 'qa-verification',
          displayName: 'QA Verification',
          finalStatus: 3,
        });
      });
    });

    describe('When:a client drives a qa-verification task through its full lifecycle', () => {
      it('should create, advance through every status, close, and read back a matching history timeline', async () => {
        const created = await createQaTask();

        expect(created).toMatchObject({
          type: 'qa-verification',
          status: 1,
          statusName: 'created',
          isClosed: false,
        });

        const triagedResponse = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: assignedUserId,
            customFields: { summary: 'Reproduces on staging' },
          })
          .expect(200);
        const triaged = triagedResponse.body as TaskResponse;

        expect(triaged).toMatchObject({
          status: 2,
          statusName: 'triaged',
          customFields: { summary: 'Reproduces on staging' },
        });

        const verifiedResponse = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 2,
            nextAssignedUserId: assignedUserId,
            customFields: { severity: 3 },
          })
          .expect(200);
        const verified = verifiedResponse.body as TaskResponse;

        expect(verified).toMatchObject({
          status: 3,
          statusName: 'verified',
          customFields: { summary: 'Reproduces on staging', severity: 3 },
        });

        const closedResponse = await request(app.getHttpServer())
          .post(`/api/v1/tasks/${created.id}/close`)
          .expect(200);
        const closed = closedResponse.body as TaskResponse;

        expect(closed).toMatchObject({ status: 3, isClosed: true });

        const historyResponse = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${created.id}/history`)
          .expect(200);
        const history = historyResponse.body as HistoryPageResponse;

        expect(history.items).toEqual([
          expect.objectContaining({ fromStatus: null, toStatus: 1, fieldsSnapshot: {} }),
          expect.objectContaining({
            fromStatus: 1,
            toStatus: 2,
            fieldsSnapshot: { summary: 'Reproduces on staging' },
          }),
          expect.objectContaining({ fromStatus: 2, toStatus: 3, fieldsSnapshot: { severity: 3 } }),
          expect.objectContaining({ fromStatus: 3, toStatus: null, fieldsSnapshot: {} }),
        ]);
      });
    });

    describe('When:a client advances a qa-verification task without its required field', () => {
      it('should answer 422 MISSING_REQUIRED_FIELDS naming the missing field', async () => {
        const created = await createQaTask();

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({ direction: 'forward', expectedStatus: 1, nextAssignedUserId: assignedUserId })
          .expect(422);
        const body = response.body as ErrorEnvelope;

        expect(body.errorCode).toBe(42203);
        expect(body.details?.missing).toEqual(['summary']);
      });
    });

    describe('When:a client advances a qa-verification task with a field over its declared maxLength', () => {
      it('should answer 422 MISSING_REQUIRED_FIELDS rejecting the oversized field rather than truncating it', async () => {
        const created = await createQaTask();

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: assignedUserId,
            customFields: { summary: 'x'.repeat(41) },
          })
          .expect(422);
        const body = response.body as ErrorEnvelope;

        expect(body.errorCode).toBe(42203);
        expect(body.details?.missing).toEqual(['summary']);
      });
    });

    describe('When:a client advances a qa-verification task with a number field outside its declared range', () => {
      it('should answer 422 MISSING_REQUIRED_FIELDS rejecting the out-of-range field', async () => {
        const created = await createQaTask();

        await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: assignedUserId,
            customFields: { summary: 'Reproduces on staging' },
          })
          .expect(200);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${created.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 2,
            nextAssignedUserId: assignedUserId,
            customFields: { severity: 9 },
          })
          .expect(422);
        const body = response.body as ErrorEnvelope;

        expect(body.errorCode).toBe(42203);
        expect(body.details?.missing).toEqual(['severity']);
      });
    });
  },
);
