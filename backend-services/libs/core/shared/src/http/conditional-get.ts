import { createHash } from 'node:crypto';

const NOT_MODIFIED = 304;
const IF_NONE_MATCH_HEADER = 'if-none-match';

export interface ConditionalGetRequestLike {
  readonly headers: Record<string, unknown>;
}

export interface ConditionalGetResponseLike {
  set(name: string, value: string): unknown;
  status(statusCode: number): { end(): unknown };
}

/**
 * Applies the "static per deployment" caching contract shared by any GET
 * endpoint whose payload only ever changes on a redeploy, not per request:
 * `Cache-Control: no-cache` plus a content-derived `ETag`. `no-cache` forces
 * revalidation on every fetch instead of trusting a fixed `max-age` window —
 * which would leave an already-open client unable to see a fresh deployment
 * until the window lapses — and the ETag turns that revalidation into an
 * empty-body 304 whenever the payload has not actually changed.
 *
 * Always sets the caching headers. Returns `true` once it has already
 * answered the request itself (a 304, nothing left to send); returns `false`
 * to tell the caller its 200 body still needs writing — this function never
 * writes a 200 body, since it has no opinion on how the caller wants to shape
 * one (json, a stream, etc).
 */
export function applyConditionalGet(
  request: ConditionalGetRequestLike,
  response: ConditionalGetResponseLike,
  body: unknown,
): boolean {
  const etag = etagOf(body);

  response.set('Cache-Control', 'no-cache');
  response.set('ETag', etag);

  if (request.headers[IF_NONE_MATCH_HEADER] === etag) {
    response.status(NOT_MODIFIED).end();
    return true;
  }

  return false;
}

function etagOf(body: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  return `"${digest}"`;
}
