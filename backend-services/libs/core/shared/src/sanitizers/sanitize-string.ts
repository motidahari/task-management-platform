/**
 * Control characters that are not whitespace — removed outright. The whitespace
 * ones (0x09–0x0D) are handled by the collapse step below, so that stripping
 * them cannot glue two words together.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const OPAQUE_CONTROL_CHARS = /[\x00-\x08\x0E-\x1F]/g;

const WHITESPACE_RUN = /\s+/g;

/**
 * Trims, collapses inner whitespace runs to a single space, and removes control
 * characters (0x00–0x1F).
 *
 * Deliberately NOT content-destructive beyond that — no HTML/tag stripping. XSS
 * defense is escape-on-output, owned by the renderer; stripping tags on input
 * would silently corrupt legitimate text (`List<string>`, `a < b`) with no error
 * and no trace. Validation may reject input loudly, but must never quietly
 * change its meaning. Control characters are the exception: they carry no
 * legitimate meaning in these fields and break logs and terminals.
 *
 * Non-string values pass through untouched — rejecting a wrong type is the
 * validator's job, and a sanitizer must never invent a value.
 */
export function sanitizeString(value: string): string;
export function sanitizeString(value: unknown): unknown;
export function sanitizeString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(OPAQUE_CONTROL_CHARS, '').replace(WHITESPACE_RUN, ' ').trim();
}
