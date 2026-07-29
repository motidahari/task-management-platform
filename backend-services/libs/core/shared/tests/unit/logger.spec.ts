import { type LogLevel, Logger, type LogSink } from '../../src/logging/logger';

interface CapturedLine {
  readonly level: LogLevel;
  readonly record: Record<string, unknown>;
}

function capturingSink(captured: CapturedLine[]): LogSink {
  return (level, line) => {
    captured.push({ level, record: JSON.parse(line) as Record<string, unknown> });
  };
}

describe('Logger', () => {
  let captured: CapturedLine[];
  let logger: Logger;

  beforeEach(() => {
    captured = [];
    logger = new Logger('TaskService', capturingSink(captured));
  });

  describe('Given:a message with no context, When:logging at each level', () => {
    it.each<LogLevel>(['error', 'warn', 'info', 'debug'])(
      'should emit one %s record carrying level, scope and message',
      (level) => {
        logger[level]('something happened');

        expect(captured).toHaveLength(1);
        expect(captured[0]?.level).toBe(level);
        expect(captured[0]?.record).toMatchObject({
          level,
          scope: 'TaskService',
          message: 'something happened',
        });
      },
    );

    it('should stamp an ISO-8601 timestamp', () => {
      logger.info('something happened');

      expect(captured[0]?.record.time).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    });
  });

  describe('Given:structured context, When:logging', () => {
    it('should flatten the context into the record so it stays queryable', () => {
      logger.warn('Request rejected', { requestId: 'req-1', status: 409 });

      expect(captured[0]?.record).toMatchObject({ requestId: 'req-1', status: 409 });
    });
  });

  describe('Given:an Error in the context, When:logging', () => {
    it('should expand it into name, message and stack', () => {
      logger.error('Request failed', { error: new TypeError('boom') });

      expect(captured[0]?.record.error).toMatchObject({ name: 'TypeError', message: 'boom' });
      expect((captured[0]?.record.error as { stack?: string }).stack).toContain('TypeError: boom');
    });
  });

  describe('Given:a non-Error thrown value in the context, When:logging', () => {
    it('should still describe it rather than serializing it as an empty object', () => {
      logger.error('Request failed', { error: 'plain string failure' });

      expect(captured[0]?.record.error).toEqual({
        name: 'string',
        message: 'plain string failure',
      });
    });
  });

  describe('Given:an unserializable context value, When:logging', () => {
    it('should keep the event and drop the context', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      logger.info('something happened', { circular });

      expect(captured[0]?.record).toMatchObject({
        level: 'info',
        scope: 'TaskService',
        message: 'something happened',
        contextSerializationFailed: true,
      });
    });
  });
});
