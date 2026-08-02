import { randomUUID } from 'node:crypto';

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
 * convention every other database-backed suite in this service uses. Kept as
 * a real, connected Postgres DataSource rather than faked query responses:
 * the endpoint's whole point is a keyset query only Postgres can actually
 * answer.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

interface TaskResponse {
  readonly id: string;
  readonly isClosed: boolean;
}

interface TaskPageResponse {
  readonly items: readonly TaskResponse[];
  readonly nextCursor: string | null;
  readonly limit: number;
}

interface ErrorResponseBody {
  readonly errorCode: number;
}

/** Well-formed but unassigned — never inserted by any builder in this suite, so it never resolves to a real row. */
const NONEXISTENT_ID = randomUUID();

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
  'User tasks pagination, Given:the app is running against a reachable Postgres instance',
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

    /**
     * Inserts a task row with an exact, caller-chosen `created_at` — `tasks`
     * is not partitioned, so unlike history rows there is no range to stay
     * inside. Raw SQL rather than `repository.save` so this test controls
     * the ordering key precisely instead of trusting whatever the ORM does
     * with a caller-supplied value on an auto-generated column.
     */
    async function insertTaskAt(
      assignedUserId: string,
      createdAt: Date,
      isClosed = false,
    ): Promise<{ id: string }> {
      const rows: Array<{ id: string }> = await testDatabase.dataSource.query(
        `INSERT INTO tasks (type, assigned_user_id, created_at, is_closed) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['procurement', assignedUserId, createdAt, isClosed],
      );
      const [row] = rows;

      if (!row) {
        throw new Error('INSERT ... RETURNING produced no row');
      }

      return { id: row.id };
    }

    describe('Given:a user with more assigned tasks than fit on one page, When:a client pages through them with a small limit', () => {
      it('should return them newest-first, honour the limit, and serve every task exactly once across pages', async () => {
        const targetUser = await createUser();
        const otherUser = await createUser();

        const oldest = await insertTaskAt(targetUser, new Date('2026-01-01T00:00:00.000Z'));
        const middle = await insertTaskAt(targetUser, new Date('2026-01-02T00:00:00.000Z'));
        const newest = await insertTaskAt(targetUser, new Date('2026-01-03T00:00:00.000Z'));
        // Noise belonging to a different user — must never surface in targetUser's pages.
        await insertTaskAt(otherUser, new Date('2026-01-04T00:00:00.000Z'));

        const firstResponse = await request(app.getHttpServer())
          .get(`/api/v1/users/${targetUser}/tasks`)
          .query({ limit: 2 })
          .expect(200);
        const firstPage = firstResponse.body as TaskPageResponse;

        expect(firstPage.items.map((task) => task.id)).toEqual([newest.id, middle.id]);
        expect(firstPage.limit).toBe(2);
        expect(typeof firstPage.nextCursor).toBe('string');

        const secondResponse = await request(app.getHttpServer())
          .get(`/api/v1/users/${targetUser}/tasks`)
          .query({ limit: 2, cursor: firstPage.nextCursor ?? '' })
          .expect(200);
        const secondPage = secondResponse.body as TaskPageResponse;

        expect(secondPage.items.map((task) => task.id)).toEqual([oldest.id]);
        expect(secondPage.nextCursor).toBeNull();

        const servedIds = [...firstPage.items, ...secondPage.items].map((task) => task.id);
        expect(new Set(servedIds).size).toBe(3);
      });
    });

    describe('Given:a user with no assigned tasks, When:their tasks are requested', () => {
      it('should answer 200 with an empty page', async () => {
        const userId = await createUser();

        const response = await request(app.getHttpServer())
          .get(`/api/v1/users/${userId}/tasks`)
          .expect(200);
        const page = response.body as TaskPageResponse;

        expect(page.items).toEqual([]);
        expect(page.nextCursor).toBeNull();
      });
    });

    describe('Given:a user with both open and closed tasks, When:their tasks are requested filtered to isClosed:true', () => {
      it('should return only the closed tasks', async () => {
        const userId = await createUser();
        await insertTaskAt(userId, new Date('2026-01-01T00:00:00.000Z'), false);
        const closedTask = await insertTaskAt(userId, new Date('2026-01-02T00:00:00.000Z'), true);

        const response = await request(app.getHttpServer())
          .get(`/api/v1/users/${userId}/tasks`)
          .query({ isClosed: 'true' })
          .expect(200);
        const page = response.body as TaskPageResponse;

        expect(page.items.map((task) => task.id)).toEqual([closedTask.id]);
      });
    });

    describe('Given:a user id that does not exist, When:their tasks are requested', () => {
      it('should answer 404 USER_NOT_FOUND', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/users/${NONEXISTENT_ID}/tasks`)
          .expect(404);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.USER_NOT_FOUND);
      });
    });

    describe('Given:an existing user, When:the cursor query param is not valid base64-encoded JSON', () => {
      it('should answer 400 VALIDATION_ERROR rather than reach the database with it', async () => {
        const userId = await createUser();

        const response = await request(app.getHttpServer())
          .get(`/api/v1/users/${userId}/tasks`)
          .query({ cursor: 'not-a-valid-cursor' })
          .expect(400);

        const body = response.body as ErrorResponseBody;
        expect(body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
      });
    });
  },
);
