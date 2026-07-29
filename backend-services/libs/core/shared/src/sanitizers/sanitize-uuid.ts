/**
 * Trims only. Casing is left alone: `@IsUUID` accepts either case, and
 * normalizing it here would hide from the validator what the client actually
 * sent.
 *
 * Non-string values pass through untouched — the validator rejects wrong types.
 */
export function sanitizeUuid(value: string): string;
export function sanitizeUuid(value: unknown): unknown;
export function sanitizeUuid(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}
