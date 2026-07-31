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

/** A single task resource, as returned by every task endpoint. */
export interface Task {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly statusName: string;
  readonly isClosed: boolean;
  readonly assignedUserId: string;
  readonly customFields: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A single seeded user resource, as returned by every user endpoint. */
export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}
