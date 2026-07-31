import { BaseValidationOptions } from './base.validators';

export function isValidDate(value: unknown, options: BaseValidationOptions = {}): boolean {
  const { optional = false, nullable = false } = options;

  if (value === undefined) return optional;
  if (value === null) return nullable;
  return value instanceof Date && !Number.isNaN(value.getTime());
}
