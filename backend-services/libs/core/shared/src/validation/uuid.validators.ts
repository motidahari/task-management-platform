import { BaseValidationOptions } from './base.validators';
import { isValidString } from './string.validators';

/** RFC 4122 style UUID: 8-4-4-4-12 hex groups (any version/variant). */
export const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Validates that a value is a UUID string. First ensures it is a non-empty
 * string, then checks it matches the UUID format.
 */
export function isValidUuid(value: unknown, options: BaseValidationOptions = {}): boolean {
  const { optional = false, nullable = false } = options;

  if (value === undefined) return optional;
  if (value === null) return nullable;
  if (!isValidString(value)) return false;
  return UUID_PATTERN.test(value as string);
}
