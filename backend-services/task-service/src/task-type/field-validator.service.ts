import { sanitizeString } from '@core/shared';
import { Injectable } from '@nestjs/common';

import { FieldValidationResult } from './interfaces/field-validation-result.interface';
import { FieldDescriptor, StatusDefinition } from './interfaces/task-type-definition.interface';

/**
 * Outcome of checking one descriptor against the value submitted for it.
 * `missing` and `invalid` are kept distinct from the start (rather than one
 * generic "rejected" case) because the caller reports them under separate
 * result buckets.
 */
type FieldOutcome =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'valid'; readonly value: string | number };

/**
 * Validates a client-submitted `customFields` payload against the
 * descriptors of one status, sanitizing every string on the way through.
 * Sanitization happens first and only on values that pass their type check —
 * a sanitizer must never be asked to interpret a shape it wasn't built for.
 *
 * Every problem is collected rather than the first one thrown: a client
 * fixing a payload one field at a time against a fail-fast validator needs
 * one round trip per mistake, so this returns everything wrong at once.
 */
@Injectable()
export class FieldValidatorService {
  validate(fields: Record<string, unknown>, status: StatusDefinition): FieldValidationResult {
    const descriptorsByKey = new Map(
      status.requiredFields.map((descriptor) => [descriptor.key, descriptor]),
    );
    const { submitted, unknownKeyReasons } = splitSubmittedFields(fields, descriptorsByKey);

    const missing: string[] = [];
    const invalid = new Map<string, string>(unknownKeyReasons);
    const sanitizedFields: Record<string, string | number> = {};

    for (const descriptor of status.requiredFields) {
      const outcome = evaluateField(descriptor, submitted.get(descriptor.key));

      switch (outcome.kind) {
        case 'missing':
          missing.push(descriptor.key);
          break;
        case 'invalid':
          invalid.set(descriptor.key, outcome.reason);
          break;
        case 'valid':
          sanitizedFields[descriptor.key] = outcome.value;
          break;
      }
    }

    if (missing.length > 0 || invalid.size > 0) {
      // Object.fromEntries assigns via CreateDataProperty, not [[Set]] — a
      // submitted key of "__proto__" lands here as an ordinary own property
      // instead of reassigning the result object's prototype.
      return { valid: false, missing, invalid: Object.fromEntries(invalid) };
    }

    return { valid: true, sanitizedFields };
  }
}

interface SubmittedFieldsSplit {
  readonly submitted: ReadonlyMap<string, unknown>;
  readonly unknownKeyReasons: ReadonlyMap<string, string>;
}

/**
 * Separates the payload into values that map to a descriptor of the target
 * status and everything else. Every other key is rejected here — including
 * one that belongs to a different status of the same type — so that a key
 * only ever reaches storage through the transition that declared it.
 */
function splitSubmittedFields(
  fields: Record<string, unknown>,
  descriptorsByKey: ReadonlyMap<string, FieldDescriptor>,
): SubmittedFieldsSplit {
  const submitted = new Map<string, unknown>();
  const unknownKeyReasons = new Map<string, string>();

  for (const rawKey of Object.keys(fields)) {
    const key = rawKey.trim();

    if (descriptorsByKey.has(key)) {
      submitted.set(key, fields[rawKey]);
    } else {
      unknownKeyReasons.set(rawKey, 'is not a field this status accepts');
    }
  }

  return { submitted, unknownKeyReasons };
}

function evaluateField(descriptor: FieldDescriptor, rawValue: unknown): FieldOutcome {
  if (rawValue === undefined) {
    return { kind: 'missing' };
  }

  return descriptor.fieldType === 'string'
    ? evaluateStringField(descriptor.maxLength, descriptor.pattern, rawValue)
    : evaluateNumberField(descriptor.min, descriptor.max, rawValue);
}

/**
 * Rejects a value over `maxLength` instead of truncating it — cutting user
 * input silently would change what the client meant to send with no error
 * and no trace; a loud rejection lets the client fix and resubmit.
 */
function evaluateStringField(
  maxLength: number,
  pattern: string | undefined,
  rawValue: unknown,
): FieldOutcome {
  if (typeof rawValue !== 'string') {
    return { kind: 'invalid', reason: 'must be a string' };
  }

  const sanitized = sanitizeString(rawValue);

  if (sanitized.length === 0) {
    return { kind: 'missing' };
  }

  if (sanitized.length > maxLength) {
    return { kind: 'invalid', reason: `must not exceed ${maxLength} characters` };
  }

  if (pattern !== undefined && !new RegExp(pattern).test(sanitized)) {
    return { kind: 'invalid', reason: 'does not match the required format' };
  }

  return { kind: 'valid', value: sanitized };
}

/**
 * `typeof rawValue !== 'number'` already rejects numeric strings — a client
 * sending `"5"` for a number field must fix its payload, not have the value
 * silently coerced. `Number.isFinite` rejects `NaN` and `Infinity` in the
 * same check.
 */
function evaluateNumberField(
  min: number | undefined,
  max: number | undefined,
  rawValue: unknown,
): FieldOutcome {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return { kind: 'invalid', reason: 'must be a finite number' };
  }

  if (min !== undefined && rawValue < min) {
    return { kind: 'invalid', reason: `must be at least ${min}` };
  }

  if (max !== undefined && rawValue > max) {
    return { kind: 'invalid', reason: `must be at most ${max}` };
  }

  return { kind: 'valid', value: rawValue };
}
