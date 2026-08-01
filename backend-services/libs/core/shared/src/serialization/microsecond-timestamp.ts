import { ValidationException } from '../errors/validation.exception';

/**
 * Postgres's `::text` cast on a UTC timestamp trims trailing zeros, so the
 * fractional part is 0-6 digits and may be absent entirely — this pattern
 * accepts every shape that cast can actually produce.
 */
const UTC_TIMESTAMP_TEXT_PATTERN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/;
const MICROSECOND_FRACTION_LENGTH = 6;
const MALFORMED_TIMESTAMP_MESSAGE = 'Timestamp text is not in the expected UTC shape';

/**
 * Converts the text Postgres produces for {@link utcTimestampTextExpression}
 * — `YYYY-MM-DD HH:MM:SS[.ffffff]`, space-separated, no offset — into a
 * fixed-length, lexicographically-sortable ISO string carrying full
 * microsecond precision: `YYYY-MM-DDTHH:mm:ss.ffffffZ`, always 27 characters.
 *
 * The fraction is right-padded, not left-padded: Postgres trims trailing
 * zeros, so a trimmed `.12` means `.120000`, never `.000012`. Right-padding
 * is what keeps a lexicographic `<=` comparison between two of these strings
 * agreeing with chronological order — the property the realtime staleness
 * guard depends on.
 *
 * Throws on anything that doesn't match this exact shape — a malformed input
 * here means the SQL projection itself changed underneath this function, not
 * a value a caller should silently coerce.
 */
export function toMicrosecondIso(pgUtcTimestampText: string): string {
  const match = UTC_TIMESTAMP_TEXT_PATTERN.exec(pgUtcTimestampText);

  if (!match) {
    throw new ValidationException(MALFORMED_TIMESTAMP_MESSAGE);
  }

  const [, datePart, timePart, fraction] = match;
  const microseconds = (fraction ?? '').padEnd(MICROSECOND_FRACTION_LENGTH, '0');

  return `${datePart}T${timePart}.${microseconds}Z`;
}

/**
 * The single SQL-fragment authority for projecting a `timestamptz` column as
 * UTC text at full stored precision — used identically by the `updatedAtRaw`
 * virtual column and every `RETURNING` clause that needs microsecond
 * precision, so the two can never drift into different rounding behavior.
 */
export function utcTimestampTextExpression(qualifiedColumn: string): string {
  return `(${qualifiedColumn} AT TIME ZONE 'UTC')::text`;
}
