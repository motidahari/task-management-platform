import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Histogram } from 'prom-client';
import { of } from 'rxjs';

import { RequestDurationInterceptor } from '../../../../src/metrics/interceptors/request-duration.interceptor';

interface FakeResponse extends Pick<Response, 'on'> {
  statusCode: number;
  emitFinish: () => void;
}

function interceptorWith(startTimer: jest.Mock): RequestDurationInterceptor {
  return new RequestDurationInterceptor({ startTimer } as unknown as Histogram<string>);
}

function fakeResponse(statusCode = 200): FakeResponse {
  const listeners: Array<() => void> = [];

  return {
    statusCode,
    on: ((event: string, listener: () => void) => {
      if (event === 'finish') {
        listeners.push(listener);
      }
    }) as Response['on'],
    emitFinish: () => {
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/tasks',
    route: undefined,
    ...overrides,
  } as unknown as Request;
}

function contextFor(request: Request, response: FakeResponse): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

const passthroughHandler: CallHandler = { handle: () => of(null) };

describe('RequestDurationInterceptor', () => {
  describe('Given:a request to an ordinary route, When:the response finishes', () => {
    it('should start the timer labelled by method and stop it labelled by route and status', () => {
      const stopTimer = jest.fn();
      const startTimer = jest.fn().mockReturnValue(stopTimer);
      const interceptor = interceptorWith(startTimer);
      const request = fakeRequest({
        method: 'PATCH',
        originalUrl: '/api/v1/tasks/t-1/status',
        route: { path: '/tasks/:id/status' },
      });
      const response = fakeResponse(200);

      interceptor.intercept(contextFor(request, response), passthroughHandler).subscribe();
      response.emitFinish();

      expect(startTimer).toHaveBeenCalledWith({ method: 'PATCH' });
      expect(stopTimer).toHaveBeenCalledWith({ route: '/tasks/:id/status', status_code: '200' });
    });

    it('should fall back to the raw URL when no route was matched', () => {
      const stopTimer = jest.fn();
      const startTimer = jest.fn().mockReturnValue(stopTimer);
      const interceptor = interceptorWith(startTimer);
      const request = fakeRequest({ originalUrl: '/unmatched' });
      const response = fakeResponse(404);

      interceptor.intercept(contextFor(request, response), passthroughHandler).subscribe();
      response.emitFinish();

      expect(stopTimer).toHaveBeenCalledWith({ route: '/unmatched', status_code: '404' });
    });
  });

  describe('Given:the metrics scrape itself, When:intercepted', () => {
    it('should not record an observation', () => {
      const startTimer = jest.fn();
      const interceptor = interceptorWith(startTimer);
      const request = fakeRequest({ originalUrl: '/metrics' });
      const response = fakeResponse(200);

      interceptor.intercept(contextFor(request, response), passthroughHandler).subscribe();
      response.emitFinish();

      expect(startTimer).not.toHaveBeenCalled();
    });

    it('should still pass the request through to the handler', (done) => {
      const interceptor = interceptorWith(jest.fn());
      const request = fakeRequest({ originalUrl: '/metrics' });
      const response = fakeResponse(200);

      interceptor
        .intercept(contextFor(request, response), passthroughHandler)
        .subscribe((value) => {
          expect(value).toBeNull();
          done();
        });
    });
  });
});
