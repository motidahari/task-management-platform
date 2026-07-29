/**
 * Trims and lowercases, so an enum or registry-key comparison never fails on
 * casing or stray whitespace alone. Applied before `@IsEnum` and before task-type
 * registry lookups (type keys are lowercase by convention).
 *
 * Non-string values pass through untouched — the validator rejects wrong types.
 */
export function sanitizeEnumKey(value: string): string;
export function sanitizeEnumKey(value: unknown): unknown;
export function sanitizeEnumKey(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim().toLowerCase();
}
