import { type LogLevel, Logger, type LogSink } from '@core/shared';
import type { NextFunction, Request, Response } from 'express';

import { requestContextMiddleware } from '../../../../src/infrastructure/http/request-context.middleware';

interface CapturedLog {
  readonly level: LogLevel;
  readonly record: Record<string, unknown>;
}

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/tasks',
    headers: {},
    route: undefined,
    ...overrides,
  } as unknown as Request;
}

function fakeResponse(): Response & { emitFinish: () => void } {
  const listeners: Array<() => void> = [];
  const headers: Record<string, string> = {};

  return {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    getHeader: (name: string) => headers[name],
    on: (event: string, listener: () => void) => {
      if (event === 'finish') {
        listeners.push(listener);
      }
    },
    emitFinish: () => {
      listeners.forEach((listener) => {
        listener();
      });
    },
  } as unknown as Response & { emitFinish: () => void };
}

describe('requestContextMiddleware', () => {
  let logs: CapturedLog[];
  let logger: Logger;
  let next: NextFunction;

  beforeEach(() => {
    logs = [];
    const sink: LogSink = (level, line) => {
      logs.push({ level, record: JSON.parse(line) as Record<string, unknown> });
    };
    logger = new Logger('HttpRequest', sink);
    next = jest.fn();
  });

  describe('Given:no x-request-id header, When:a request arrives', () => {
    it('should generate one and set it on req.id', () => {
      const req = fakeRequest() as Request & { id?: string };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should echo the generated id on the response header', () => {
      const req = fakeRequest() as Request & { id?: string };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(res.getHeader('x-request-id')).toBe(req.id);
    });

    it('should call next', () => {
      requestContextMiddleware(logger)(fakeRequest(), fakeResponse(), next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:an x-request-id header, When:a request arrives', () => {
    it('should reuse it instead of generating a new one', () => {
      const req = fakeRequest({ headers: { 'x-request-id': 'client-req-1' } }) as Request & {
        id?: string;
      };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).toBe('client-req-1');
      expect(res.getHeader('x-request-id')).toBe('client-req-1');
    });

    it('should take the first value and validate it when the header repeats', () => {
      const req = fakeRequest({
        headers: { 'x-request-id': ['client-req-1', 'client-req-2'] },
      }) as Request & { id?: string };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).toBe('client-req-1');
    });
  });

  describe('Given:an x-request-id header that is unsafe to trust, When:a request arrives', () => {
    it('should generate an id instead of echoing one over 128 characters', () => {
      const oversized = 'a'.repeat(129);
      const req = fakeRequest({ headers: { 'x-request-id': oversized } }) as Request & {
        id?: string;
      };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).not.toBe(oversized);
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should generate an id instead of echoing whitespace that trims to empty', () => {
      const req = fakeRequest({ headers: { 'x-request-id': '   ' } }) as Request & {
        id?: string;
      };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should generate an id instead of echoing a value with control characters', () => {
      const req = fakeRequest({
        headers: { 'x-request-id': `req-1${String.fromCharCode(0x00)}injected` },
      }) as Request & { id?: string };
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);

      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should never throw, even for a value outgoing headers would reject', () => {
      const req = fakeRequest({
        headers: { 'x-request-id': 'req\r\nSet-Cookie: injected=1' },
      }) as Request & { id?: string };
      const res = fakeResponse();

      expect(() => requestContextMiddleware(logger)(req, res, next)).not.toThrow();
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Given:the response finishes, When:the request completes', () => {
    it('should log one structured line with method, route, status and duration', () => {
      const req = fakeRequest({ method: 'PATCH', originalUrl: '/api/v1/tasks/t-1/status' });
      const res = fakeResponse();
      res.statusCode = 200;

      requestContextMiddleware(logger)(req, res, next);
      res.emitFinish();

      expect(logs).toHaveLength(1);
      const record = logs[0]?.record;

      expect(record?.method).toBe('PATCH');
      expect(record?.route).toBe('/api/v1/tasks/t-1/status');
      expect(record?.status).toBe(200);
      expect(typeof record?.requestId).toBe('string');
      expect(typeof record?.durationMs).toBe('number');
    });

    it('should prefer the matched route pattern over the raw URL when available', () => {
      const req = fakeRequest({
        originalUrl: '/api/v1/tasks/t-1/status',
        route: { path: '/tasks/:id/status' },
      });
      const res = fakeResponse();

      requestContextMiddleware(logger)(req, res, next);
      res.emitFinish();

      expect(logs[0]?.record.route).toBe('/tasks/:id/status');
    });
  });
});
