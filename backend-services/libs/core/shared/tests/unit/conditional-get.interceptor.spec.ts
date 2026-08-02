import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, lastValueFrom, of } from 'rxjs';

import { ConditionalGetInterceptor } from '../../src/http/conditional-get.interceptor';

interface CapturedResponse {
  headers: Record<string, string>;
  status?: number;
}

function contextFor(
  request: { headers: Record<string, unknown> },
  response: object,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

function responseFor(captured: CapturedResponse): object {
  return {
    set(name: string, value: string) {
      captured.headers[name] = value;
    },
    status(statusCode: number) {
      captured.status = statusCode;
    },
  };
}

function handlerReturning(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

describe('ConditionalGetInterceptor', () => {
  const interceptor = new ConditionalGetInterceptor();

  describe('Given:a request with no If-None-Match header', () => {
    it('should set Cache-Control: no-cache and an ETag, and let the body through unchanged', async () => {
      const captured: CapturedResponse = { headers: {} };
      const context = contextFor({ headers: {} }, responseFor(captured));
      const body = { type: 'procurement' };

      const emitted = await firstValueFrom(interceptor.intercept(context, handlerReturning(body)));

      expect(emitted).toBe(body);
      expect(captured.headers['Cache-Control']).toBe('no-cache');
      expect(captured.headers.ETag).toEqual(expect.stringMatching(/^".+"$/));
      expect(captured.status).toBeUndefined();
    });

    it('should complete the observable with the handler own result, the same way any other route does', async () => {
      const context = contextFor({ headers: {} }, responseFor({ headers: {} }));
      const body = { type: 'procurement' };

      const result = await lastValueFrom(interceptor.intercept(context, handlerReturning(body)));

      expect(result).toBe(body);
    });
  });

  describe('Given:an If-None-Match header that matches the handler-returned body', () => {
    it('should set the 304 status and complete with a value instead of emitting nothing', async () => {
      const body = { type: 'procurement' };
      const probe: CapturedResponse = { headers: {} };
      await firstValueFrom(
        interceptor.intercept(
          contextFor({ headers: {} }, responseFor(probe)),
          handlerReturning(body),
        ),
      );
      const currentEtag = probe.headers.ETag;

      const captured: CapturedResponse = { headers: {} };
      const context = contextFor(
        { headers: { 'if-none-match': currentEtag } },
        responseFor(captured),
      );

      const emittedValues: unknown[] = [];
      let completed = false;
      await new Promise<void>((resolve, reject) => {
        interceptor.intercept(context, handlerReturning(body)).subscribe({
          next: (value) => emittedValues.push(value),
          error: reject,
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(emittedValues).toHaveLength(1);
      expect(emittedValues[0]).toBeUndefined();
      expect(completed).toBe(true);
      expect(captured.status).toBe(304);
    });
  });

  describe('Given:an If-None-Match header that does not match the handler-returned body', () => {
    it('should let the body through unchanged', async () => {
      const captured: CapturedResponse = { headers: {} };
      const context = contextFor(
        { headers: { 'if-none-match': '"stale-etag-value"' } },
        responseFor(captured),
      );
      const body = { type: 'development' };

      const emitted = await firstValueFrom(interceptor.intercept(context, handlerReturning(body)));

      expect(emitted).toBe(body);
      expect(captured.status).toBeUndefined();
    });
  });
});
