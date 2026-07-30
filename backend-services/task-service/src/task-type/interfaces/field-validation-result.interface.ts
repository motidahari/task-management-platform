/**
 * A discriminated union rather than an always-present `errors: []` array —
 * the `valid` flag lets a caller branch with the type system narrowing
 * `sanitizedFields` vs. `missing`/`invalid` into scope, instead of trusting
 * that an empty array incidentally means success.
 */
export interface FieldValidationSuccess {
  readonly valid: true;
  /**
   * Exactly the values that will be merged into storage — already
   * sanitized, never the raw client input.
   */
  readonly sanitizedFields: Readonly<Record<string, string | number>>;
}

export interface FieldValidationFailure {
  readonly valid: false;
  /** Descriptor keys the target status requires that were absent or empty. */
  readonly missing: readonly string[];
  /** Submitted key → human-readable reason it was rejected. */
  readonly invalid: Readonly<Record<string, string>>;
}

export type FieldValidationResult = FieldValidationSuccess | FieldValidationFailure;
