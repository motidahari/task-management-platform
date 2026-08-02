import { createHash } from 'node:crypto';

const NOT_MODIFIED = 304;
const IF_NONE_MATCH_HEADER = 'if-none-match';

export interface ConditionalGetRequestLike {
  readonly headers: Record<string, unknown>;
}

export interface ConditionalGetResponseLike {
  set(name: string, value: string): unknown;
  status(statusCode: number): unknown;
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
 * Always sets the caching headers. On a match it also sets the 304 status,
 * but deliberately stops there — it never writes or ends the response, so
 * the framework's own response-completion path is the only thing that ever
 * sends a byte for this request. Returns `true` to tell the caller the
 * request is already answered and no body should be sent; `false` to tell
 * the caller its 200 body still needs writing — this function never writes a
 * 200 body either, since it has no opinion on how the caller wants to shape
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
    response.status(NOT_MODIFIED);
    return true;
  }

  return false;
}

function etagOf(body: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  return `"${digest}"`;
}
