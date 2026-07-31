import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIoServer, type Namespace } from 'socket.io';

import { createRedisClient } from '../../../src/infrastructure/redis/redis-client.provider';
import type { RealtimeGateway } from '../../../src/realtime/realtime.gateway';
import {
  TaskEventsPublisher,
  type TaskEventPayload,
} from '../../../src/realtime/task-events.publisher';
import { taskRoom } from '../../../src/realtime/rooms';

/**
 * Runs only against a real Redis instance reachable at `REDIS_URL` — skipped
 * entirely, rather than failed, when no Redis is configured for the local
 * run, the same convention every other integration suite in this service uses.
 */
const REDIS_URL = process.env.REDIS_URL;
const describeAgainstRealRedis = REDIS_URL ? describe : describe.skip;

/** Matches the gateway's own namespace so this suite exercises the real event contract. */
const REALTIME_NAMESPACE = '/realtime';

const EVENT_WAIT_TIMEOUT_MS = 5_000;

/**
 * The Redis adapter issues its `PSUBSCRIBE` to the broadcast channel
 * fire-and-forget from the constructor — nothing in its public surface
 * signals when that subscription has actually been acknowledged by Redis.
 * Until it has, a publish from the other instance is not queued or
 * retried, it is simply never received (pub/sub, not a durable queue) —
 * so a single emit issued immediately after startup is racy by
 * construction. Retrying a disposable warm-up event on a bounded budget
 * bridges exactly that one-time startup gap; every real test below then
 * emits exactly once, as the assertion intends.
 */
const ADAPTER_READY_BUDGET_MS = 3_000;
const ADAPTER_READY_RETRY_INTERVAL_MS = 100;
const WARMUP_TASK_ID = 'zztest-adapter-warmup';

interface JoinTaskMessage {
  readonly taskId: string;
}

/**
 * One running Socket.IO node — its own HTTP listener, its own `/realtime`
 * namespace, and its own Redis pub/sub pair. Two of these, backed by the
 * same Redis, are what the adapter needs to actually cross an instance
 * boundary instead of just delivering to sockets already in-process.
 */
interface RealtimeInstance {
  readonly httpServer: HttpServer;
  readonly io: SocketIoServer;
  readonly namespace: Namespace;
  readonly pubClient: Redis;
  readonly subClient: Redis;
  readonly port: number;
}

/**
 * Reproduces `redis-adapter.provider.ts`: a dedicated pub/sub client pair per
 * instance (a subscribed Redis connection can only issue subscribe commands,
 * so it can never double as the publisher), and the adapter constructor set
 * on the root server the way the gateway's `afterInit` does — never on the
 * namespace directly, only the root exposes `adapter()`.
 */
async function startRealtimeInstance(redisUrl: string): Promise<RealtimeInstance> {
  const pubClient = createRedisClient(redisUrl);
  const subClient = pubClient.duplicate();

  const httpServer = createServer();
  const io = new SocketIoServer(httpServer);
  const namespace = io.of(REALTIME_NAMESPACE);

  io.adapter(createAdapter(pubClient, subClient));

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;

  return { httpServer, io, namespace, pubClient, subClient, port };
}

async function stopRealtimeInstance(instance: RealtimeInstance): Promise<void> {
  await instance.io.close();
  await Promise.all([instance.pubClient.quit(), instance.subClient.quit()]);
  await new Promise<void>((resolve) => instance.httpServer.close(() => resolve()));
}

/**
 * Mirrors `RealtimeGateway.handleJoinTask` for a socket connecting directly
 * to this namespace, without pulling in Nest's DI container and decorator
 * dispatch just to answer one message — that handler already has its own
 * unit coverage; what this suite exercises is Redis fan-out, not room-join
 * wiring.
 */
function registerJoinTaskHandler(namespace: Namespace): void {
  namespace.on('connection', (socket) => {
    socket.on('join:task', (message: JoinTaskMessage, ack?: () => void) => {
      void (async () => {
        await socket.join(taskRoom(message.taskId));
        ack?.();
      })();
    });
  });
}

function buildTaskEventPayload(overrides: Partial<TaskEventPayload> = {}): TaskEventPayload {
  return {
    task: { id: 'task-1', assignedUserId: 'user-1', type: 'procurement' },
    updatedAt: '2026-07-31T10:00:00.000000Z',
    ...overrides,
  };
}

/**
 * Blocks until an emit from `sender` is observed to actually arrive at
 * `receiver` over Redis, retrying a disposable warm-up event on
 * {@link ADAPTER_READY_RETRY_INTERVAL_MS} until it does or
 * {@link ADAPTER_READY_BUDGET_MS} is exhausted — see the constant's
 * comment for why this is necessary rather than a fixed sleep.
 */
async function waitUntilCrossInstanceDeliveryIsReady(
  sender: RealtimeInstance,
  receiver: RealtimeInstance,
): Promise<void> {
  const probe = ioClient(`http://localhost:${receiver.port}${REALTIME_NAMESPACE}`, {
    transports: ['websocket'],
  });

  try {
    await new Promise<void>((resolve) => probe.once('connect', resolve));
    await new Promise<void>((resolve) =>
      probe.emit('join:task', { taskId: WARMUP_TASK_ID }, resolve),
    );

    const deadline = Date.now() + ADAPTER_READY_BUDGET_MS;

    while (Date.now() < deadline) {
      const delivered = await new Promise<boolean>((resolve) => {
        probe.once('task:created', () => resolve(true));
        sender.namespace
          .to(taskRoom(WARMUP_TASK_ID))
          .emit(
            'task:created',
            buildTaskEventPayload({ task: { id: WARMUP_TASK_ID, assignedUserId: 'zztest-user' } }),
          );
        setTimeout(() => resolve(false), ADAPTER_READY_RETRY_INTERVAL_MS);
      });

      if (delivered) {
        return;
      }
    }

    throw new Error('Redis adapter cross-instance delivery did not become ready in time');
  } finally {
    probe.disconnect();
  }
}

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}" after ${EVENT_WAIT_TIMEOUT_MS}ms`));
    }, EVENT_WAIT_TIMEOUT_MS);

    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describeAgainstRealRedis(
  'Redis-adapter cross-instance fan-out, Given:two independent realtime instances sharing one Redis',
  () => {
    let instanceA: RealtimeInstance;
    let instanceB: RealtimeInstance;
    let publisherA: TaskEventsPublisher;
    let client: ClientSocket;

    beforeAll(async () => {
      [instanceA, instanceB] = await Promise.all([
        startRealtimeInstance(REDIS_URL as string),
        startRealtimeInstance(REDIS_URL as string),
      ]);

      registerJoinTaskHandler(instanceB.namespace);

      const gatewayLikeA = { namespace: instanceA.namespace } as unknown as RealtimeGateway;
      publisherA = new TaskEventsPublisher(gatewayLikeA);

      await waitUntilCrossInstanceDeliveryIsReady(instanceA, instanceB);
    }, ADAPTER_READY_BUDGET_MS + EVENT_WAIT_TIMEOUT_MS);

    afterAll(async () => {
      await Promise.all([stopRealtimeInstance(instanceA), stopRealtimeInstance(instanceB)]);
    });

    afterEach(() => {
      client?.disconnect();
    });

    describe('When:a client connected to instance B has joined a task room, and instance A emits to that room', () => {
      it('should deliver the event, with the full payload, to the socket on instance B', async () => {
        const taskId = 'cross-instance-task-1';
        const payload = buildTaskEventPayload({ task: { id: taskId, assignedUserId: 'user-1' } });

        client = ioClient(`http://localhost:${instanceB.port}${REALTIME_NAMESPACE}`, {
          transports: ['websocket'],
        });
        await new Promise<void>((resolve) => client.once('connect', resolve));
        await new Promise<void>((resolve) => client.emit('join:task', { taskId }, resolve));

        const received = waitForEvent<TaskEventPayload>(client, 'task:updated');
        publisherA.publish('task:updated', payload);

        await expect(received).resolves.toEqual(payload);
      });
    });

    describe('When:a client on instance B has not joined the room instance A emits to', () => {
      it('should not receive the event', async () => {
        const payload = buildTaskEventPayload({
          task: { id: 'cross-instance-task-unjoined', assignedUserId: 'user-1' },
        });

        client = ioClient(`http://localhost:${instanceB.port}${REALTIME_NAMESPACE}`, {
          transports: ['websocket'],
        });
        await new Promise<void>((resolve) => client.once('connect', resolve));

        const neverReceived = new Promise<void>((resolve) => {
          client.once('task:updated', () => resolve());
        });

        publisherA.publish('task:updated', payload);
        const raced = await Promise.race([
          neverReceived.then(() => 'received' as const),
          new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 500)),
        ]);

        expect(raced).toBe('timed-out');
      });
    });
  },
);
