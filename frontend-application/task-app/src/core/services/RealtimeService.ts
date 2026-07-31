import { io, type Socket } from 'socket.io-client';

import type { Task } from '../../features/tasks/types';
import { bus } from '../bus/bus';
import { appConfig } from '../config/app.config';

const REALTIME_NAMESPACE_PATH = '/realtime';

export type TaskEventName = 'task:created' | 'task:updated' | 'task:closed';

/**
 * Full task resource plus the server's commit timestamp — the same shape a
 * REST response carries, so a store can apply it through the exact staleness
 * guard it already trusts for its own mutations.
 */
export interface TaskEventPayload {
  readonly task: Task;
  readonly updatedAt: string;
}

export type TaskEventHandler = (payload: TaskEventPayload) => void;

/**
 * Falls back to a same-origin relative path instead of throwing at import
 * time when the configured API URL is empty or malformed — this module is
 * instantiated as a singleton, so a throw here would take the whole app down
 * with a blank page before the dedicated config-error screen ever gets a
 * chance to render.
 */
function realtimeNamespaceUrl(apiBaseUrl: string): string {
  try {
    return `${new URL(apiBaseUrl).origin}${REALTIME_NAMESPACE_PATH}`;
  } catch {
    return REALTIME_NAMESPACE_PATH;
  }
}

/**
 * Socket.IO singleton — the socket twin of `BaseHttpService`: owns the one
 * connection, room membership, and reconnection recovery so nothing above
 * this layer touches `socket.io-client` directly. Callers only ever see
 * typed event subscriptions and room join/leave methods.
 */
export class RealtimeService {
  private readonly socket: Socket;
  private readonly joinedUserIds = new Set<string>();
  private readonly joinedTaskIds = new Set<string>();

  constructor() {
    this.socket = io(realtimeNamespaceUrl(appConfig.apiBaseUrl));
    this.socket.io.on('reconnect', this.handleReconnect);
  }

  /** Subscribes `handler` to `event` and returns the matching unsubscribe function — same shape as the bus's `on()` so callers tear down every channel the same way. */
  on(event: TaskEventName, handler: TaskEventHandler): () => void {
    this.socket.on(event, handler);
    return () => this.socket.off(event, handler);
  }

  joinUser(userId: string): void {
    this.joinedUserIds.add(userId);
    this.socket.emit('join:user', { userId });
  }

  leaveUser(userId: string): void {
    this.joinedUserIds.delete(userId);
    this.socket.emit('leave:user', { userId });
  }

  joinTask(taskId: string): void {
    this.joinedTaskIds.add(taskId);
    this.socket.emit('join:task', { taskId });
  }

  leaveTask(taskId: string): void {
    this.joinedTaskIds.delete(taskId);
    this.socket.emit('leave:task', { taskId });
  }

  /**
   * A dropped connection loses whatever events fired during the gap —
   * at-most-once delivery, no replay. Re-sending every room this client
   * still holds restores the exact subscriptions it had before the drop;
   * the single bus emit afterward is the one signal mounted views need to
   * refetch and close that gap themselves, so it fires once here rather
   * than once per rejoined room.
   */
  private readonly handleReconnect = (): void => {
    this.joinedUserIds.forEach((userId) => this.socket.emit('join:user', { userId }));
    this.joinedTaskIds.forEach((taskId) => this.socket.emit('join:task', { taskId }));
    bus.emit('realtime:reconnected');
  };
}

export const realtimeService = new RealtimeService();
