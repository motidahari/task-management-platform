import { Global, Module, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { UserEntity } from '../../src/domain/entities/user.entity';
import { APP_CONFIG, type AppConfig } from '../../src/infrastructure/config/app.config';
import { DatabaseModule, READ_CONNECTION } from '../../src/infrastructure/database/database.module';
import { configureApp } from '../../src/infrastructure/http/configure-app';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis-client.provider';
import type { TaskEventPayload } from '../../src/realtime/task-events.publisher';
import { buildTestUser } from '../integration/support/test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TestDatabase,
} from '../integration/support/test-database';

/**
 * This suite is the one place a real socket client sits on the other end of
 * an emitted event, so — unlike every other API suite — it needs the real
 * Redis-backed realtime adapter wired up, not the namespace-bootstrap stub
 * the rest fake out. Runs only when both a real Postgres (`DB_URL`) and a
 * real Redis (`REDIS_URL`) are reachable; skipped entirely otherwise, same
 * convention as every other database- or Redis-gated suite in this service.
 */
const REDIS_URL = process.env.REDIS_URL;
const describeAgainstRealInfra = isTestDatabaseConfigured() && REDIS_URL ? describe : describe.skip;

const REALTIME_NAMESPACE = '/realtime';
const EVENT_WAIT_TIMEOUT_MS = 5_000;
/**
 * `RealtimeGateway`'s `join:user`/`join:task` handlers return `void`, so
 * Nest never sends a socket.io acknowledgment back — there is nothing this
 * suite can await to know the server has actually joined the room. A join
 * message is tiny and processed on the same event loop that already has to
 * finish a real Postgres round trip before any event could be published, so
 * a short, generous margin is enough to make the race a non-issue without
 * touching the gateway just to add an ack this suite would be the only
 * caller of.
 */
const JOIN_SETTLE_MS = 150;

interface TaskResponse {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly statusName: string;
  readonly isClosed: boolean;
  readonly assignedUserId: string;
  readonly customFields: Record<string, unknown>;
  readonly updatedAt: string;
}

interface CapturedTaskEvent {
  readonly event: string;
  readonly payload: TaskEventPayload;
}

/** Same rationale as `task-history.api.spec.ts` — see that file for why the whole module is swapped instead of an in-place provider override. */
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectRealtimeClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}${REALTIME_NAMESPACE}`, {
      transports: ['websocket'],
    });

    client.once('connect', () => resolve(client));
  });
}

/** Records every task event the client receives, in arrival order, for both content and count assertions. */
function trackTaskEvents(client: ClientSocket): CapturedTaskEvent[] {
  const events: CapturedTaskEvent[] = [];

  client.onAny((event: string, payload: TaskEventPayload) => {
    if (event === 'task:created' || event === 'task:updated' || event === 'task:closed') {
      events.push({ event, payload });
    }
  });

  return events;
}

function waitForEvent(client: ClientSocket, event: string): Promise<TaskEventPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}" after ${EVENT_WAIT_TIMEOUT_MS}ms`));
    }, EVENT_WAIT_TIMEOUT_MS);

    client.once(event, (payload: TaskEventPayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function joinUserRoom(client: ClientSocket, userId: string): Promise<void> {
  client.emit('join:user', { userId });
  await delay(JOIN_SETTLE_MS);
}

async function joinTaskRoom(client: ClientSocket, taskId: string): Promise<void> {
  client.emit('join:task', { taskId });
  await delay(JOIN_SETTLE_MS);
}

describeAgainstRealInfra(
  "TaskService's realtime emission, Given:the app is running against reachable Postgres and Redis instances",
  () => {
    let testDatabase: TestDatabase;
    let app: NestExpressApplication;
    let port: number;

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
      redisUrl: REDIS_URL ?? '',
      corsOrigins: ['http://allowed.example.com'],
      throttle: { ttlSec: 60, limit: 1000 },
      realtime: { maxConnections: 1000 },
    };

    /** Same rationale as every other API suite — the throttler's own Redis need not be real. */
    const fakeRedisClient: Redis = Object.assign(Object.create(Redis.prototype) as Redis, {
      call: jest.fn().mockResolvedValue([1, 60_000, 0, 0]),
      quit: jest.fn().mockResolvedValue('OK'),
    });

    beforeAll(async () => {
      testDatabase = await setupTestDatabase();

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_CONFIG)
        .useValue(BASE_CONFIG)
        .overrideModule(DatabaseModule)
        .useModule(buildRealDatabaseModule(testDatabase.dataSource))
        .overrideProvider(REDIS_CLIENT)
        .useValue(fakeRedisClient)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app, BASE_CONFIG);
      // A real, listening TCP server is what a socket.io client needs to
      // connect to — supertest's usual ephemeral bind on `getHttpServer()`
      // is not enough for that.
      await app.listen(0);
      port = (app.getHttpServer().address() as { port: number }).port;
    });

    beforeEach(async () => {
      await testDatabase.openLedger();
    });

    afterEach(async () => {
      await testDatabase.cleanup();
    });

    afterAll(async () => {
      await app.close();
      await testDatabase.teardown();
    });

    async function seedUser(): Promise<string> {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());

      return user.id;
    }

    describe('When:a client with a connected, room-joined socket triggers create, then change, then close on the same task', () => {
      it('should emit exactly one realtime event per mutation, each carrying the committed resource', async () => {
        const assigneeId = await seedUser();
        const client = await connectRealtimeClient(port);
        const events = trackTaskEvents(client);

        try {
          await joinUserRoom(client, assigneeId);

          const createdEvent = waitForEvent(client, 'task:created');
          const createResponse = await request(app.getHttpServer())
            .post('/api/v1/tasks')
            .send({ type: 'procurement', assignedUserId: assigneeId })
            .expect(201);
          const created = createResponse.body as TaskResponse;
          const createdPayload = await createdEvent;

          expect(createdPayload.task).toMatchObject({
            id: created.id,
            assignedUserId: assigneeId,
            status: 1,
          });
          expect(createdPayload.updatedAt).toBe(created.updatedAt);
          expect(events.filter((entry) => entry.event === 'task:created')).toHaveLength(1);

          await joinTaskRoom(client, created.id);

          const firstAdvanceEvent = waitForEvent(client, 'task:updated');
          const firstAdvanceResponse = await request(app.getHttpServer())
            .patch(`/api/v1/tasks/${created.id}/status`)
            .send({
              direction: 'forward',
              expectedStatus: 1,
              nextAssignedUserId: assigneeId,
              customFields: { quote1: 'quote-one', quote2: 'quote-two' },
            })
            .expect(200);
          const firstAdvance = firstAdvanceResponse.body as TaskResponse;
          const firstAdvancePayload = await firstAdvanceEvent;

          expect(firstAdvancePayload.task).toMatchObject({ id: created.id, status: 2 });
          expect(firstAdvancePayload.updatedAt).toBe(firstAdvance.updatedAt);
          expect(events.filter((entry) => entry.event === 'task:updated')).toHaveLength(1);

          const secondAdvanceEvent = waitForEvent(client, 'task:updated');
          const secondAdvanceResponse = await request(app.getHttpServer())
            .patch(`/api/v1/tasks/${created.id}/status`)
            .send({
              direction: 'forward',
              expectedStatus: 2,
              nextAssignedUserId: assigneeId,
              customFields: { receipt: 'receipt-one' },
            })
            .expect(200);
          const secondAdvance = secondAdvanceResponse.body as TaskResponse;
          const secondAdvancePayload = await secondAdvanceEvent;

          expect(secondAdvancePayload.task).toMatchObject({ id: created.id, status: 3 });
          expect(secondAdvancePayload.updatedAt).toBe(secondAdvance.updatedAt);
          expect(events.filter((entry) => entry.event === 'task:updated')).toHaveLength(2);

          const closedEvent = waitForEvent(client, 'task:closed');
          const closeResponse = await request(app.getHttpServer())
            .post(`/api/v1/tasks/${created.id}/close`)
            .expect(200);
          const closed = closeResponse.body as TaskResponse;
          const closedPayload = await closedEvent;

          expect(closedPayload.task).toMatchObject({ id: created.id, isClosed: true });
          expect(closedPayload.updatedAt).toBe(closed.updatedAt);
          expect(events.filter((entry) => entry.event === 'task:closed')).toHaveLength(1);

          expect(events).toHaveLength(4);
        } finally {
          client.disconnect();
        }
      });
    });

    describe('When:a status-change request carries a stale expectedStatus (TASK_STATE_CONFLICT)', () => {
      it('should reject the request and publish zero events', async () => {
        const assigneeId = await seedUser();
        const client = await connectRealtimeClient(port);
        const events = trackTaskEvents(client);

        try {
          await joinUserRoom(client, assigneeId);

          const createdEvent = waitForEvent(client, 'task:created');
          const createResponse = await request(app.getHttpServer())
            .post('/api/v1/tasks')
            .send({ type: 'procurement', assignedUserId: assigneeId })
            .expect(201);
          const created = createResponse.body as TaskResponse;
          await createdEvent;

          await joinTaskRoom(client, created.id);

          const eventCountBeforeConflict = events.length;

          const conflictResponse = await request(app.getHttpServer())
            .patch(`/api/v1/tasks/${created.id}/status`)
            .send({
              direction: 'forward',
              // The task is still at status 1 — this claims a status it never reached.
              expectedStatus: 99,
              nextAssignedUserId: assigneeId,
            })
            .expect(409);

          expect(conflictResponse.body).toMatchObject({ errorCode: 40901 });

          // No ack exists for "an event was not published" — a bounded wait
          // for one that must not arrive is the only way to assert its
          // absence rather than merely its absence-so-far.
          await delay(500);

          expect(events).toHaveLength(eventCountBeforeConflict);
        } finally {
          client.disconnect();
        }
      });
    });
  },
);
