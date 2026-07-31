import { BaseValidationOptions } from './base.validators';

export function isValidBigInt(value: unknown, options: BaseValidationOptions = {}): boolean {
  const { optional = false, nullable = false } = options;

  if (value === undefined) return optional;
  if (value === null) return nullable;
  return typeof value === 'bigint';
}
