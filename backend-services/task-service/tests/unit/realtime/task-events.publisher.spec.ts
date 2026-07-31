import { Logger } from '@core/shared';

import type { RealtimeGateway } from '../../../src/realtime/realtime.gateway';
import {
  TaskEventsPublisher,
  type TaskEventPayload,
} from '../../../src/realtime/task-events.publisher';

function payloadFor(taskId: string, assignedUserId: string): TaskEventPayload {
  return {
    task: { id: taskId, assignedUserId },
    updatedAt: '2026-07-31T10:00:00.000000Z',
  };
}

interface TestSetup {
  readonly publisher: TaskEventsPublisher;
  readonly to: jest.Mock;
  readonly emit: jest.Mock;
  readonly loggerError: jest.Mock;
}

function setUp(): TestSetup {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const gateway = { namespace: { to } } as unknown as RealtimeGateway;
  const loggerError = jest.fn();
  const logger = { error: loggerError } as unknown as Logger;

  const publisher = new TaskEventsPublisher(gateway, logger);

  return { publisher, to, emit, loggerError };
}

describe('TaskEventsPublisher', () => {
  describe('Given:a task event with no previous assignee, When:it is published', () => {
    it('should emit once to the task room and the current assignee room', () => {
      const { publisher, to, emit } = setUp();
      const payload = payloadFor('task-1', 'user-1');

      publisher.publish('task:created', payload);

      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['task:task-1', 'user:user-1']);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('task:created', payload);
    });
  });

  describe('Given:a status change where the assignee did not change, When:it is published', () => {
    it('should target the task room and that one assignee room, without duplicating it', () => {
      const { publisher, to } = setUp();
      const payload = payloadFor('task-1', 'user-1');

      publisher.publish('task:updated', payload, 'user-1');

      expect(to).toHaveBeenCalledWith(['task:task-1', 'user:user-1']);
    });
  });

  describe('Given:a status change that reassigned the task, When:it is published', () => {
    it('should target the task room, the new assignee room, and the previous assignee room', () => {
      const { publisher, to } = setUp();
      const payload = payloadFor('task-1', 'user-2');

      publisher.publish('task:updated', payload, 'user-1');

      expect(to).toHaveBeenCalledWith(['task:task-1', 'user:user-2', 'user:user-1']);
    });
  });

  describe('Given:a task being closed, When:it is published', () => {
    it('should target the task room and its assignee room', () => {
      const { publisher, to } = setUp();
      const payload = payloadFor('task-1', 'user-1');

      publisher.publish('task:closed', payload);

      expect(to).toHaveBeenCalledWith(['task:task-1', 'user:user-1']);
    });
  });

  describe('Given:the underlying namespace fails to emit, When:a task event is published', () => {
    it('should swallow the failure and log it instead of throwing', () => {
      const { publisher, emit, loggerError } = setUp();
      const failure = new Error('adapter unavailable');

      emit.mockImplementation(() => {
        throw failure;
      });

      expect(() => publisher.publish('task:updated', payloadFor('task-1', 'user-1'))).not.toThrow();
      expect(loggerError).toHaveBeenCalledTimes(1);
      expect(loggerError).toHaveBeenCalledWith(expect.any(String), {
        event: 'task:updated',
        taskId: 'task-1',
        error: failure,
      });
    });
  });
});
