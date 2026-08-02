import { ErrorCode } from '@core/shared';
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
import { isTestDatabaseConfigured, useTestDatabase } from '../integration/support/test-database';

/**
 * Runs only against a real Postgres instance reachable at `DB_URL` — same
 * convention every other database-backed suite in this service uses. A real,
 * connected Postgres DataSource is kept (rather than faking query responses)
 * because these error rows are only reachable by actually locking, updating
 * and re-reading task rows.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

/** Well-formed but unassigned — never inserted by any builder in this suite, so it never resolves to a real row. */
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

interface TaskResponse {
  readonly id: string;
  readonly status: number;
  readonly isClosed: boolean;
}

interface ErrorResponseBody {
  readonly errorCode: number;
  readonly errorMessage: string;
  readonly details?: Record<string, unknown>;
}

/** Same rationale as `task-lifecycle.api.spec.ts` — see that file for why the whole module is swapped instead of an in-place provider override. */
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
  'Task errors, Given:the app is running against a reachable Postgres instance',
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

    async function createUser(): Promise<string> {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());

      return user.id;
    }

    async function createTask(assignedUserId: string): Promise<TaskResponse> {
      const response = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ type: 'procurement', assignedUserId })
        .expect(201);

      return response.body as TaskResponse;
    }

    /** A procurement task already at its final status (3), still open. */
    async function createTaskAtFinalStatus(assignedUserId: string): Promise<TaskResponse> {
      const created = await createTask(assignedUserId);

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${created.id}/status`)
        .send({
          direction: 'forward',
          expectedStatus: 1,
          nextAssignedUserId: assignedUserId,
          customFields: { quote1: '100 USD', quote2: '120 USD' },
        })
        .expect(200);

      const finalResponse = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${created.id}/status`)
        .send({
          direction: 'forward',
          expectedStatus: 2,
          nextAssignedUserId: assignedUserId,
          customFields: { receipt: 'receipt-001' },
        })
        .expect(200);

      return finalResponse.body as TaskResponse;
    }

    describe('Given:a create-task request naming an unregistered type', () => {
      it('should answer 422 UNKNOWN_TASK_TYPE', async () => {
        const userId = await createUser();

        const response = await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .send({ type: 'not-a-real-type', assignedUserId: userId })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.UNKNOWN_TASK_TYPE);
      });
    });

    describe('Given:a create-task request naming a user that does not exist', () => {
      it('should answer 422 ASSIGNEE_NOT_FOUND', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .send({ type: 'procurement', assignedUserId: NONEXISTENT_ID })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.ASSIGNEE_NOT_FOUND);
      });
    });

    describe('Given:a create-task request whose body fails transport validation', () => {
      it('should answer 400 VALIDATION_ERROR carrying the class-validator messages', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .send({ type: '', assignedUserId: 'not-a-uuid' })
          .expect(400);

        const body = response.body as ErrorResponseBody;
        const details = body.details as { validation?: readonly string[] } | undefined;
        expect(body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
        expect(details?.validation).toEqual(
          expect.arrayContaining([expect.stringContaining('assignedUserId')]),
        );
      });
    });

    describe('Given:a request to read a task id that does not exist', () => {
      it('should answer 404 TASK_NOT_FOUND', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${NONEXISTENT_ID}`)
          .expect(404);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_NOT_FOUND);
      });
    });

    describe('Given:a change-status request against a task id that does not exist', () => {
      it('should answer 404 TASK_NOT_FOUND', async () => {
        const userId = await createUser();

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${NONEXISTENT_ID}/status`)
          .send({ direction: 'forward', expectedStatus: 1, nextAssignedUserId: userId })
          .expect(404);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_NOT_FOUND);
      });
    });

    describe('Given:a change-status request whose body fails transport validation', () => {
      it('should answer 400 VALIDATION_ERROR rather than reach the service', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({ direction: 'sideways', expectedStatus: 1, nextAssignedUserId: userId })
          .expect(400);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
      });
    });

    describe('Given:a task already closed, When:a status change is requested against it', () => {
      it('should answer 409 TASK_CLOSED', async () => {
        const userId = await createUser();
        const atFinal = await createTaskAtFinalStatus(userId);
        await request(app.getHttpServer()).post(`/api/v1/tasks/${atFinal.id}/close`).expect(200);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${atFinal.id}/status`)
          .send({ direction: 'backward', expectedStatus: 3, nextAssignedUserId: userId })
          .expect(409);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_CLOSED);
      });

      it('should still answer 409 TASK_CLOSED even when expectedStatus is also stale — the closed check runs first', async () => {
        const userId = await createUser();
        const atFinal = await createTaskAtFinalStatus(userId);
        await request(app.getHttpServer()).post(`/api/v1/tasks/${atFinal.id}/close`).expect(200);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${atFinal.id}/status`)
          .send({ direction: 'backward', expectedStatus: 1, nextAssignedUserId: userId })
          .expect(409);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_CLOSED);
      });
    });

    describe('Given:a task whose status already moved on, When:a status change is submitted against the stale expectedStatus', () => {
      it('should answer 409 TASK_STATE_CONFLICT carrying the current status', async () => {
        const userId = await createUser();
        const task = await createTask(userId);
        await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: userId,
            customFields: { quote1: '100 USD', quote2: '120 USD' },
          })
          .expect(200);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: userId,
            customFields: { quote1: '100 USD', quote2: '120 USD' },
          })
          .expect(409);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_STATE_CONFLICT);
        expect(body.details).toMatchObject({ currentStatus: 2 });
      });

      it('should reject a duplicate submission of the same already-applied change the same way', async () => {
        const userId = await createUser();
        const task = await createTask(userId);
        const advanceBody = {
          direction: 'forward' as const,
          expectedStatus: 1,
          nextAssignedUserId: userId,
          customFields: { quote1: '100 USD', quote2: '120 USD' },
        };

        await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send(advanceBody)
          .expect(200);

        const duplicateResponse = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send(advanceBody)
          .expect(409);

        const body = duplicateResponse.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_STATE_CONFLICT);
      });
    });

    describe('Given:a task already at its final status, When:a forward status change is requested', () => {
      it('should answer 422 INVALID_STATUS_TRANSITION', async () => {
        const userId = await createUser();
        const atFinal = await createTaskAtFinalStatus(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${atFinal.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 3,
            nextAssignedUserId: userId,
            customFields: {},
          })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      });
    });

    describe('Given:a task at status 1, When:a backward status change is requested', () => {
      it('should answer 422 INVALID_STATUS_TRANSITION', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({ direction: 'backward', expectedStatus: 1, nextAssignedUserId: userId })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      });
    });

    describe('Given:a forward status change omitting the target status’s required fields', () => {
      it('should answer 422 MISSING_REQUIRED_FIELDS listing every missing key', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: userId,
            customFields: {},
          })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELDS);
        expect(body.details).toEqual({ missing: ['quote1', 'quote2'] });
      });
    });

    describe('Given:a forward status change carrying a field key the target status does not accept', () => {
      it('should answer 422 MISSING_REQUIRED_FIELDS listing the undeclared key', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: userId,
            customFields: { quote1: '100 USD', quote2: '120 USD', receipt: 'not-accepted-here' },
          })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELDS);
        expect(body.details).toEqual({ missing: ['receipt'] });
      });
    });

    describe('Given:a forward status change naming a nextAssignedUserId that does not exist', () => {
      it('should answer 422 ASSIGNEE_NOT_FOUND once the submitted fields are otherwise valid', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: NONEXISTENT_ID,
            customFields: { quote1: '100 USD', quote2: '120 USD' },
          })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.ASSIGNEE_NOT_FOUND);
      });

      it('should still answer 422 MISSING_REQUIRED_FIELDS when the fields are also invalid — field validation runs first', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${task.id}/status`)
          .send({
            direction: 'forward',
            expectedStatus: 1,
            nextAssignedUserId: NONEXISTENT_ID,
            customFields: {},
          })
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELDS);
      });
    });

    describe('Given:a close request against a task id that does not exist', () => {
      it('should answer 404 TASK_NOT_FOUND', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/tasks/${NONEXISTENT_ID}/close`)
          .expect(404);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_NOT_FOUND);
      });
    });

    describe('Given:a task already closed, When:it is closed again', () => {
      it('should answer 409 TASK_CLOSED', async () => {
        const userId = await createUser();
        const atFinal = await createTaskAtFinalStatus(userId);
        await request(app.getHttpServer()).post(`/api/v1/tasks/${atFinal.id}/close`).expect(200);

        const response = await request(app.getHttpServer())
          .post(`/api/v1/tasks/${atFinal.id}/close`)
          .expect(409);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_CLOSED);
      });
    });

    describe('Given:a task that has not reached its final status, When:it is closed', () => {
      it('should answer 422 TASK_NOT_AT_FINAL_STATUS', async () => {
        const userId = await createUser();
        const task = await createTask(userId);

        const response = await request(app.getHttpServer())
          .post(`/api/v1/tasks/${task.id}/close`)
          .expect(422);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.TASK_NOT_AT_FINAL_STATUS);
      });
    });
  },
);
