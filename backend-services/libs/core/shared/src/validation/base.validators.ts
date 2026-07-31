/** Options shared by every validator: absence handling for undefined and null. */
export interface BaseValidationOptions {
  /** Allow undefined as a valid value. Default: false */
  optional?: boolean;
  /** Allow null as a valid value. Default: false */
  nullable?: boolean;
}
