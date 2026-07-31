/**
 * True when `value` is a non-null, non-array object — i.e. a `{ ... }`-shaped
 * record rather than an array or `null` (both of which are `typeof 'object'`).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
