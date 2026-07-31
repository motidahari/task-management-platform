import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { ConditionalGetInterceptor } from '../../src/http/conditional-get.interceptor';

interface CapturedResponse {
  headers: Record<string, string>;
  status?: number;
  ended: boolean;
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

      return {
        end() {
          captured.ended = true;
        },
      };
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
      const captured: CapturedResponse = { headers: {}, ended: false };
      const context = contextFor({ headers: {} }, responseFor(captured));
      const body = { type: 'procurement' };

      const emitted = await firstValueFrom(interceptor.intercept(context, handlerReturning(body)));

      expect(emitted).toBe(body);
      expect(captured.headers['Cache-Control']).toBe('no-cache');
      expect(captured.headers.ETag).toEqual(expect.stringMatching(/^".+"$/));
      expect(captured.status).toBeUndefined();
    });
  });

  describe('Given:an If-None-Match header that matches the handler-returned body', () => {
    it('should answer 304 itself and complete without emitting the body', async () => {
      const body = { type: 'procurement' };
      const probe: CapturedResponse = { headers: {}, ended: false };
      await firstValueFrom(
        interceptor.intercept(
          contextFor({ headers: {} }, responseFor(probe)),
          handlerReturning(body),
        ),
      );
      const currentEtag = probe.headers.ETag;

      const captured: CapturedResponse = { headers: {}, ended: false };
      const context = contextFor(
        { headers: { 'if-none-match': currentEtag } },
        responseFor(captured),
      );

      const emittedValues: unknown[] = [];
      await new Promise<void>((resolve) => {
        interceptor.intercept(context, handlerReturning(body)).subscribe({
          next: (value) => emittedValues.push(value),
          complete: resolve,
        });
      });

      expect(emittedValues).toHaveLength(0);
      expect(captured.status).toBe(304);
      expect(captured.ended).toBe(true);
    });
  });

  describe('Given:an If-None-Match header that does not match the handler-returned body', () => {
    it('should let the body through unchanged', async () => {
      const captured: CapturedResponse = { headers: {}, ended: false };
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
