import { ValidationException } from '../errors/validation.exception';

/** One page of a keyset-paginated list, plus the opaque cursor for the next one (`null` once exhausted). */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Decoded shape of an opaque keyset cursor — the last row's ordering key. */
export interface KeysetCursor {
  readonly createdAt: Date;
  readonly id: string;
}

const MALFORMED_CURSOR_MESSAGE = 'Pagination cursor is malformed';

/**
 * Base64 of `{ createdAt, id }` — opaque to the client, just carries the
 * ordering key of the last row on the page so the next request can resume
 * exactly where this one stopped.
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

/**
 * The inverse of {@link encodeKeysetCursor}. A client can hand back anything —
 * a hand-edited value, a cursor from an unrelated endpoint, plain garbage —
 * so every failure mode (bad base64, bad JSON, wrong shape, unparsable date)
 * collapses to the same `ValidationException`, which the transport layer maps
 * to 400 rather than letting a malformed value reach the query planner.
 */
export function decodeKeysetCursor(cursor: string): KeysetCursor {
  const decoded = parseCursorJson(cursor);

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  const { createdAt, id } = decoded as Record<string, unknown>;

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  if (typeof createdAt !== 'string') {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  const parsedCreatedAt = new Date(createdAt);

  if (Number.isNaN(parsedCreatedAt.getTime())) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  return { createdAt: parsedCreatedAt, id };
}

function parseCursorJson(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }
}
