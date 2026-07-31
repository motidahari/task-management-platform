import { beforeEach, describe, expect, it, vi } from 'vitest';

const { socketMock, ioMock, busEmitMock } = vi.hoisted(() => {
  const socket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    io: { on: vi.fn() },
  };

  return { socketMock: socket, ioMock: vi.fn(() => socket), busEmitMock: vi.fn() };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('../bus/bus', () => ({ bus: { emit: busEmitMock, on: vi.fn(), off: vi.fn() } }));

import type { TaskEventPayload } from './RealtimeService';
import { RealtimeService } from './RealtimeService';

function reconnectHandler(): () => void {
  const call = socketMock.io.on.mock.calls.find(([event]) => event === 'reconnect');
  return call?.[1] as () => void;
}

describe('RealtimeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:a new instance', () => {
    it('should connect to the realtime namespace derived from the configured API origin', () => {
      new RealtimeService();

      expect(ioMock).toHaveBeenCalledWith('http://localhost:3000/realtime');
    });

    it('should register a manager-level reconnect handler', () => {
      new RealtimeService();

      expect(socketMock.io.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
    });
  });

  describe('Given:subscribing to a task event', () => {
    it('should forward the handler to the socket and invoke it with the payload it receives', () => {
      const service = new RealtimeService();
      const handler = vi.fn();

      service.on('task:updated', handler);

      expect(socketMock.on).toHaveBeenCalledWith('task:updated', handler);
    });

    it('should unsubscribe from the socket when the returned function is called', () => {
      const service = new RealtimeService();
      const handler = vi.fn();

      const unsubscribe = service.on('task:created', handler);
      unsubscribe();

      expect(socketMock.off).toHaveBeenCalledWith('task:created', handler);
    });
  });

  describe('Given:joining and leaving the user room', () => {
    it('should emit join:user with the userId', () => {
      const service = new RealtimeService();

      service.joinUser('u-1');

      expect(socketMock.emit).toHaveBeenCalledWith('join:user', { userId: 'u-1' });
    });

    it('should emit leave:user with the userId', () => {
      const service = new RealtimeService();

      service.leaveUser('u-1');

      expect(socketMock.emit).toHaveBeenCalledWith('leave:user', { userId: 'u-1' });
    });
  });

  describe('Given:joining and leaving the task room', () => {
    it('should emit join:task with the taskId', () => {
      const service = new RealtimeService();

      service.joinTask('t-1');

      expect(socketMock.emit).toHaveBeenCalledWith('join:task', { taskId: 't-1' });
    });

    it('should emit leave:task with the taskId', () => {
      const service = new RealtimeService();

      service.leaveTask('t-1');

      expect(socketMock.emit).toHaveBeenCalledWith('leave:task', { taskId: 't-1' });
    });
  });

  describe('Given:the socket reconnects while rooms are held', () => {
    it('should re-emit join for every currently held user and task room and emit realtime:reconnected exactly once', () => {
      const service = new RealtimeService();
      service.joinUser('u-1');
      service.joinTask('t-1');
      socketMock.emit.mockClear();

      reconnectHandler()();

      expect(socketMock.emit).toHaveBeenCalledWith('join:user', { userId: 'u-1' });
      expect(socketMock.emit).toHaveBeenCalledWith('join:task', { taskId: 't-1' });
      expect(busEmitMock).toHaveBeenCalledTimes(1);
      expect(busEmitMock).toHaveBeenCalledWith('realtime:reconnected');
    });

    it('should not rejoin a room that was left before the reconnect', () => {
      const service = new RealtimeService();
      service.joinUser('u-1');
      service.leaveUser('u-1');
      socketMock.emit.mockClear();

      reconnectHandler()();

      expect(socketMock.emit).not.toHaveBeenCalledWith('join:user', { userId: 'u-1' });
    });
  });

  describe('Given:a payload flowing through a live subscription', () => {
    it('should hand it to the subscribed handler untouched', () => {
      const service = new RealtimeService();
      const handler = vi.fn();
      service.on('task:closed', handler);
      const [, registeredHandler] = socketMock.on.mock.calls.at(-1) as [
        string,
        (payload: TaskEventPayload) => void,
      ];
      const payload: TaskEventPayload = {
        task: {
          id: 't-1',
          type: 'development',
          status: 3,
          statusName: 'done',
          isClosed: true,
          assignedUserId: 'u-1',
          customFields: {},
          createdAt: '2026-01-01T00:00:00.000000Z',
          updatedAt: '2026-01-01T00:00:01.000000Z',
        },
        updatedAt: '2026-01-01T00:00:01.000000Z',
      };

      registeredHandler(payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  });
});
