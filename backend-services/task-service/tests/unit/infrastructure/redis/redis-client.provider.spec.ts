import { Logger } from '@core/shared';

import { createRedisClient } from '../../../../src/infrastructure/redis/redis-client.provider';

type Handler = (arg?: unknown) => void;

const handlers = new Map<string, Handler>();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: (event: string, handler: Handler): void => {
      handlers.set(event, handler);
    },
  }));
});

function emit(event: string, arg?: unknown): void {
  handlers.get(event)?.(arg);
}

describe('createRedisClient', () => {
  let logger: jest.Mocked<Pick<Logger, 'error' | 'info'>>;

  beforeEach(() => {
    handlers.clear();
    logger = { error: jest.fn(), info: jest.fn() };
    createRedisClient('redis://localhost:6379', logger as unknown as Logger);
  });

  describe('Given:a connection outage, When:ioredis emits repeated error events', () => {
    it('should log the outage once rather than on every retry', () => {
      emit('error', new Error('ECONNREFUSED'));
      emit('error', new Error('ECONNREFUSED'));
      emit('error', new Error('ECONNREFUSED'));

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:an outage was already logged, When:the connection becomes ready', () => {
    it('should log the recovery and re-arm error logging for the next outage', () => {
      emit('error', new Error('ECONNREFUSED'));
      emit('ready');
      emit('error', new Error('ECONNREFUSED'));

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given:the connection is ready without any prior outage', () => {
    it('should not log a spurious recovery message', () => {
      emit('ready');

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
