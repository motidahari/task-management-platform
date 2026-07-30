/**
 * A discriminated union rather than one flat interface with every constraint
 * optional: `maxLength`/`pattern` only make sense for a string field,
 * `min`/`max` only for a number field. `DynamicFieldsForm` narrows on
 * `fieldType` to pick the right input and the right constraints — a flat
 * shape would let a mismatch (e.g. `min` on a string field) type-check.
 */
export interface StringFieldDescriptor {
  readonly key: string;
  readonly label: string;
  readonly fieldType: 'string';
  readonly maxLength: number;
  readonly pattern?: string;
}

export interface NumberFieldDescriptor {
  readonly key: string;
  readonly label: string;
  readonly fieldType: 'number';
  readonly min?: number;
  readonly max?: number;
}

export type FieldDescriptor = StringFieldDescriptor | NumberFieldDescriptor;

export interface StatusDefinition {
  readonly status: number;
  readonly name: string;
  readonly displayName: string;
  readonly requiredFields: readonly FieldDescriptor[];
}

/**
 * `finalStatus` is derived by the server (last entry of `statuses`) — kept
 * here only as the value the client reads, never recomputed on this side.
 */
export interface TaskTypeDefinition {
  readonly type: string;
  readonly displayName: string;
  readonly finalStatus: number;
  readonly statuses: readonly StatusDefinition[];
}
