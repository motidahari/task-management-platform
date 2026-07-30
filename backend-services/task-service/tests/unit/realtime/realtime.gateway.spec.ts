import { Logger } from '@core/shared';
import type { Gauge } from 'prom-client';
import type { Namespace, Socket } from 'socket.io';

import type { AppConfig } from '../../../src/infrastructure/config/app.config';
import { isOriginAllowed, RealtimeGateway } from '../../../src/realtime/realtime.gateway';
import type { RealtimeRedisAdapterFactory } from '../../../src/realtime/redis-adapter.provider';

const ALLOWED_ORIGIN = 'http://allowed.example.com';
const DISALLOWED_ORIGIN = 'http://not-allowed.example.com';

function configWith(maxConnections: number, corsOrigins: readonly string[] = []): AppConfig {
  return { corsOrigins, realtime: { maxConnections } } as unknown as AppConfig;
}

interface FakeNamespace {
  readonly namespace: Namespace;
  readonly adapter: jest.Mock;
}

function fakeNamespace(socketCount: number): FakeNamespace {
  const adapter = jest.fn();
  const namespace = {
    sockets: { size: socketCount },
    server: { adapter },
  } as unknown as Namespace;

  return { namespace, adapter };
}

interface FakeClient {
  readonly socket: Socket;
  readonly disconnect: jest.Mock;
  readonly join: jest.Mock;
  readonly leave: jest.Mock;
}

function fakeClient(): FakeClient {
  const disconnect = jest.fn();
  const join = jest.fn().mockResolvedValue(undefined);
  const leave = jest.fn().mockResolvedValue(undefined);
  const socket = { disconnect, join, leave } as unknown as Socket;

  return { socket, disconnect, join, leave };
}

interface TestSetup {
  readonly gateway: RealtimeGateway;
  readonly namespace: Namespace;
  readonly namespaceAdapter: jest.Mock;
  readonly redisAdapterConstructor: RealtimeRedisAdapterFactory['adapterConstructor'];
  readonly gaugeSet: jest.Mock;
  readonly loggerWarn: jest.Mock;
}

function setUp(
  maxConnections: number,
  socketCount = 0,
  corsOrigins: readonly string[] = [],
): TestSetup {
  const { namespace, adapter: namespaceAdapter } = fakeNamespace(socketCount);
  const redisAdapterConstructor =
    jest.fn() as unknown as RealtimeRedisAdapterFactory['adapterConstructor'];
  const redisAdapter = {
    adapterConstructor: redisAdapterConstructor,
  } as unknown as RealtimeRedisAdapterFactory;
  const gaugeSet = jest.fn();
  const gauge = { set: gaugeSet } as unknown as Gauge<string>;
  const loggerWarn = jest.fn();
  const logger = { warn: loggerWarn } as unknown as Logger;

  const gateway = new RealtimeGateway(
    configWith(maxConnections, corsOrigins),
    redisAdapter,
    gauge,
    logger,
  );

  Object.assign(gateway, { server: namespace });

  return { gateway, namespace, namespaceAdapter, redisAdapterConstructor, gaugeSet, loggerWarn };
}

describe('RealtimeGateway', () => {
  afterEach(() => {
    RealtimeGateway.allowedOrigins = [];
  });

  describe('Given:the gateway has finished initializing, When:afterInit runs', () => {
    it('should wire the Redis adapter constructor onto the root Socket.IO server', () => {
      const { gateway, namespace, namespaceAdapter, redisAdapterConstructor } = setUp(10);

      gateway.afterInit(namespace);

      expect(namespaceAdapter).toHaveBeenCalledWith(redisAdapterConstructor);
    });
  });

  describe('Given:connections are below the configured cap, When:a client connects', () => {
    it('should accept the client and report the current connection count', () => {
      const { gateway, namespace, gaugeSet } = setUp(10, 5);
      const { socket, disconnect } = fakeClient();

      gateway.handleConnection(socket);

      expect(disconnect).not.toHaveBeenCalled();
      expect(gaugeSet).toHaveBeenCalledWith(namespace.sockets.size);
    });
  });

  describe('Given:the connection cap has already been reached, When:one more client connects', () => {
    it('should disconnect the client instead of accepting it', () => {
      const { gateway, gaugeSet, loggerWarn } = setUp(10, 11);
      const { socket, disconnect } = fakeClient();

      gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalledWith(true);
      expect(gaugeSet).not.toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a client disconnects, When:handleDisconnect runs', () => {
    it('should report the connection count after the disconnect', () => {
      const { gateway, namespace, gaugeSet } = setUp(10, 4);

      gateway.handleDisconnect();

      expect(gaugeSet).toHaveBeenCalledWith(namespace.sockets.size);
    });
  });

  describe('Given:a client requests to watch a user, When:join:user is handled', () => {
    it('should join the room named after that user', async () => {
      const { gateway } = setUp(10);
      const { socket, join } = fakeClient();

      await gateway.handleJoinUser(socket, { userId: 'user-1' });

      expect(join).toHaveBeenCalledWith('user:user-1');
    });

    it('should ignore a message with no userId', async () => {
      const { gateway } = setUp(10);
      const { socket, join } = fakeClient();

      await gateway.handleJoinUser(socket, {} as { userId: string });

      expect(join).not.toHaveBeenCalled();
    });
  });

  describe('Given:a client stops watching a user, When:leave:user is handled', () => {
    it('should leave the room named after that user', async () => {
      const { gateway } = setUp(10);
      const { socket, leave } = fakeClient();

      await gateway.handleLeaveUser(socket, { userId: 'user-1' });

      expect(leave).toHaveBeenCalledWith('user:user-1');
    });
  });

  describe('Given:a client opens a task detail view, When:join:task is handled', () => {
    it('should join the room named after that task', async () => {
      const { gateway } = setUp(10);
      const { socket, join } = fakeClient();

      await gateway.handleJoinTask(socket, { taskId: 'task-1' });

      expect(join).toHaveBeenCalledWith('task:task-1');
    });

    it('should ignore a message with no taskId', async () => {
      const { gateway } = setUp(10);
      const { socket, join } = fakeClient();

      await gateway.handleJoinTask(socket, {} as { taskId: string });

      expect(join).not.toHaveBeenCalled();
    });
  });

  describe('Given:a client closes a task detail view, When:leave:task is handled', () => {
    it('should leave the room named after that task', async () => {
      const { gateway } = setUp(10);
      const { socket, leave } = fakeClient();

      await gateway.handleLeaveTask(socket, { taskId: 'task-1' });

      expect(leave).toHaveBeenCalledWith('task:task-1');
    });
  });

  describe('Given:the gateway was built with a CORS allowlist, When:a connecting origin is on it', () => {
    it('should allow the same origins the HTTP layer allows', () => {
      setUp(10, 0, [ALLOWED_ORIGIN]);
      const callback = jest.fn();

      isOriginAllowed(ALLOWED_ORIGIN, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('Given:the gateway was built with a CORS allowlist, When:a connecting origin is not on it', () => {
    it('should reject the origin', () => {
      setUp(10, 0, [ALLOWED_ORIGIN]);
      const callback = jest.fn();

      isOriginAllowed(DISALLOWED_ORIGIN, callback);

      expect(callback).toHaveBeenCalledWith(null, false);
    });

    it('should reject a missing origin', () => {
      setUp(10, 0, [ALLOWED_ORIGIN]);
      const callback = jest.fn();

      isOriginAllowed(undefined, callback);

      expect(callback).toHaveBeenCalledWith(null, false);
    });
  });
});
