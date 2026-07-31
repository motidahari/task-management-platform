import { Logger } from '@core/shared';
import { Inject, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import type { Namespace, Socket } from 'socket.io';

import { APP_CONFIG, type AppConfig } from '../infrastructure/config/app.config';
import { SOCKET_CONNECTIONS_GAUGE_NAME } from '../metrics/metrics.constants';
import { REALTIME_REDIS_ADAPTER, type RealtimeRedisAdapterFactory } from './redis-adapter.provider';
import { taskRoom, userRoom } from './rooms';

const REALTIME_NAMESPACE = '/realtime';

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

/**
 * `@WebSocketGateway`'s `cors` option is captured once, when Socket.IO's
 * underlying HTTP server is created during Nest's module bootstrap — before
 * this class has even been constructed, so there is no injected `AppConfig`
 * to read yet. A delegate function sidesteps that: Socket.IO (via the `cors`
 * package underneath) invokes it on every connection attempt, always at
 * request time, by which point the constructor below has already populated
 * {@link RealtimeGateway.allowedOrigins} from the exact same typed config the
 * HTTP layer's CORS middleware reads — one allowlist, both channels, with no
 * second env parse living in this file.
 */
function isOriginAllowed(origin: string | undefined, callback: CorsOriginCallback): void {
  const isAllowed = origin !== undefined && RealtimeGateway.allowedOrigins.includes(origin);

  callback(null, isAllowed);
}

interface UserRoomMessage {
  readonly userId: string;
}

interface TaskRoomMessage {
  readonly taskId: string;
}

/**
 * Connection lifecycle and room membership only — event emission is the
 * publisher's job (kept out of this class so it stays a leaf transport
 * concern). Rooms are a routing optimization here, not an access boundary:
 * any client may join any room, matching this platform's current no-auth
 * stance.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE, cors: { origin: isOriginAllowed } })
export class RealtimeGateway
  implements OnGatewayInit<Namespace>, OnGatewayConnection, OnGatewayDisconnect
{
  /** Read by {@link isOriginAllowed}; written once, from the constructor's injected config. */
  static allowedOrigins: readonly string[] = [];

  @WebSocketServer()
  private readonly server!: Namespace;

  private readonly maxConnections: number;

  /**
   * Read-only escape hatch for {@link TaskEventsPublisher} — the one other
   * class in this module allowed to reach the underlying namespace, so it
   * can emit to rooms without this gateway growing emit responsibilities of
   * its own (connection lifecycle and room membership stay its only job).
   */
  get namespace(): Namespace {
    return this.server;
  }

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(REALTIME_REDIS_ADAPTER) private readonly redisAdapter: RealtimeRedisAdapterFactory,
    @InjectMetric(SOCKET_CONNECTIONS_GAUGE_NAME) private readonly connectionsGauge: Gauge<string>,
    @Optional() private readonly logger: Logger = new Logger(RealtimeGateway.name),
  ) {
    RealtimeGateway.allowedOrigins = config.corsOrigins;
    this.maxConnections = config.realtime.maxConnections;
  }

  /**
   * Fans this instance's emits out to every other instance via Redis
   * pub/sub. The adapter constructor is set on the root Socket.IO server
   * (`namespace.server`, not the namespace itself — only the root exposes
   * `adapter()`), which re-initializes every namespace registered on it,
   * this one included.
   */
  afterInit(namespace: Namespace): void {
    namespace.server.adapter(this.redisAdapter.adapterConstructor);
  }

  handleConnection(client: Socket): void {
    if (this.server.sockets.size > this.maxConnections) {
      this.logger.warn('Realtime connection cap reached — rejecting client', {
        maxConnections: this.maxConnections,
      });
      client.disconnect(true);
      return;
    }

    this.connectionsGauge.set(this.server.sockets.size);
  }

  handleDisconnect(): void {
    this.connectionsGauge.set(this.server.sockets.size);
  }

  @SubscribeMessage('join:user')
  async handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UserRoomMessage,
  ): Promise<void> {
    if (!message?.userId) {
      return;
    }

    await client.join(userRoom(message.userId));
  }

  @SubscribeMessage('leave:user')
  async handleLeaveUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UserRoomMessage,
  ): Promise<void> {
    if (!message?.userId) {
      return;
    }

    await client.leave(userRoom(message.userId));
  }

  @SubscribeMessage('join:task')
  async handleJoinTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: TaskRoomMessage,
  ): Promise<void> {
    if (!message?.taskId) {
      return;
    }

    await client.join(taskRoom(message.taskId));
  }

  @SubscribeMessage('leave:task')
  async handleLeaveTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: TaskRoomMessage,
  ): Promise<void> {
    if (!message?.taskId) {
      return;
    }

    await client.leave(taskRoom(message.taskId));
  }
}

export { isOriginAllowed };
