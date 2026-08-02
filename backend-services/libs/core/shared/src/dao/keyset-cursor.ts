import { ValidationException } from '../errors/validation.exception';

/** One page of a keyset-paginated list, plus the opaque cursor for the next one (`null` once exhausted). */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * Decoded shape of an opaque keyset cursor — the last row's ordering key.
 *
 * `createdAt` is the fixed-length, microsecond-precision UTC ISO string
 * (`YYYY-MM-DDTHH:mm:ss.ffffffZ`, see `toMicrosecondIso`) — never a `Date`,
 * which only resolves to millisecond precision. Rows sharing one
 * `created_at` down to the microsecond are common (bulk seeds, same-request
 * writes), and a cursor that can't carry the full value it was cut from
 * would silently drop or repeat rows tied to it at a page boundary.
 */
export interface KeysetCursor {
  readonly createdAt: string;
  readonly id: string;
}

const MALFORMED_CURSOR_MESSAGE = 'Pagination cursor is malformed';
const MICROSECOND_FRACTION_LENGTH = 6;

/**
 * Matches the ISO shape `encodeKeysetCursor` always produces —
 * `YYYY-MM-DDTHH:mm:ss.ffffffZ` — plus every shorter fraction a cursor
 * issued before this precision fix can still carry (a JS `Date`'s
 * `toISOString()` always emits exactly 3 digits, but the pattern accepts
 * 1-6 so any such cursor decodes rather than breaking outstanding clients).
 */
const CURSOR_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;

/**
 * Base64 of `{ createdAt, id }` — opaque to the client, just carries the
 * ordering key of the last row on the page so the next request can resume
 * exactly where this one stopped. `createdAt` is already the fixed-length
 * microsecond string the DAO read off the row; encoding never rounds it.
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id })).toString(
    'base64url',
  );
}

/**
 * The inverse of {@link encodeKeysetCursor}. A client can hand back anything —
 * a hand-edited value, a cursor from an unrelated endpoint, plain garbage —
 * so every failure mode (bad base64, bad JSON, wrong shape, unparsable
 * timestamp) collapses to the same `ValidationException`, which the
 * transport layer maps to 400 rather than letting a malformed value reach
 * the query planner.
 *
 * A shorter-than-microsecond fraction (a cursor issued before this fix, or
 * simply one cut from a row whose trailing digits happened to be zero) is
 * right-padded to six digits rather than rejected — the same "trimmed means
 * trailing zeros" convention `toMicrosecondIso` uses for Postgres's own text
 * cast, so a legacy cursor resumes at the start of the millisecond it names
 * instead of failing outstanding clients outright.
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

  const match = CURSOR_TIMESTAMP_PATTERN.exec(createdAt);

  if (!match) {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }

  const [, wholeSeconds, fraction] = match;
  const microseconds = (fraction ?? '').padEnd(MICROSECOND_FRACTION_LENGTH, '0');

  return { createdAt: `${wholeSeconds}.${microseconds}Z`, id };
}

function parseCursorJson(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationException(MALFORMED_CURSOR_MESSAGE);
  }
}
