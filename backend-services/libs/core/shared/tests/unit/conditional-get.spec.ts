import {
  applyConditionalGet,
  type ConditionalGetRequestLike,
  type ConditionalGetResponseLike,
} from '../../src/http/conditional-get';

interface CapturedResponse {
  headers: Record<string, string>;
  status?: number;
  ended: boolean;
}

function requestWithIfNoneMatch(value: string | undefined): ConditionalGetRequestLike {
  return { headers: value === undefined ? {} : { 'if-none-match': value } };
}

function responseFor(captured: CapturedResponse): ConditionalGetResponseLike {
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

describe('applyConditionalGet', () => {
  describe('Given:no If-None-Match header on the request', () => {
    it('should set Cache-Control: no-cache and an ETag, and report the caller still owns the 200 body', () => {
      const captured: CapturedResponse = { headers: {}, ended: false };
      const response = responseFor(captured);

      const alreadyAnswered = applyConditionalGet(requestWithIfNoneMatch(undefined), response, {
        hello: 'world',
      });

      expect(alreadyAnswered).toBe(false);
      expect(captured.headers['Cache-Control']).toBe('no-cache');
      expect(captured.headers.ETag).toEqual(expect.stringMatching(/^".+"$/));
      expect(captured.status).toBeUndefined();
      expect(captured.ended).toBe(false);
    });
  });

  describe('Given:an If-None-Match header that does not match the current body', () => {
    it('should still report the caller owns the 200 body', () => {
      const captured: CapturedResponse = { headers: {}, ended: false };
      const response = responseFor(captured);

      const alreadyAnswered = applyConditionalGet(
        requestWithIfNoneMatch('"stale-etag-value"'),
        response,
        { hello: 'world' },
      );

      expect(alreadyAnswered).toBe(false);
      expect(captured.status).toBeUndefined();
    });
  });

  describe('Given:an If-None-Match header that matches the current body', () => {
    it('should answer 304 itself, with no body, and report that it already did', () => {
      const body = { hello: 'world' };
      const probe: CapturedResponse = { headers: {}, ended: false };
      applyConditionalGet(requestWithIfNoneMatch(undefined), responseFor(probe), body);
      const currentEtag = probe.headers.ETag;

      const captured: CapturedResponse = { headers: {}, ended: false };
      const response = responseFor(captured);

      const alreadyAnswered = applyConditionalGet(
        requestWithIfNoneMatch(currentEtag),
        response,
        body,
      );

      expect(alreadyAnswered).toBe(true);
      expect(captured.status).toBe(304);
      expect(captured.ended).toBe(true);
    });
  });

  describe('Given:the same body across two calls', () => {
    it('should produce the same ETag both times', () => {
      const firstCaptured: CapturedResponse = { headers: {}, ended: false };
      const secondCaptured: CapturedResponse = { headers: {}, ended: false };
      const body = { type: 'procurement', finalStatus: 3 };

      applyConditionalGet(requestWithIfNoneMatch(undefined), responseFor(firstCaptured), body);
      applyConditionalGet(requestWithIfNoneMatch(undefined), responseFor(secondCaptured), body);

      expect(firstCaptured.headers.ETag).toBe(secondCaptured.headers.ETag);
    });
  });

  describe('Given:two different bodies', () => {
    it('should produce different ETags', () => {
      const firstCaptured: CapturedResponse = { headers: {}, ended: false };
      const secondCaptured: CapturedResponse = { headers: {}, ended: false };

      applyConditionalGet(requestWithIfNoneMatch(undefined), responseFor(firstCaptured), {
        type: 'procurement',
      });
      applyConditionalGet(requestWithIfNoneMatch(undefined), responseFor(secondCaptured), {
        type: 'development',
      });

      expect(firstCaptured.headers.ETag).not.toBe(secondCaptured.headers.ETag);
    });
  });
});
