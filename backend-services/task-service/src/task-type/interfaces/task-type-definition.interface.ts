/** DI token — inject this to receive every registered {@link TaskTypeDefinition}. */
export const ALL_TASK_TYPE_DEFINITIONS = Symbol('ALL_TASK_TYPE_DEFINITIONS');

/**
 * A discriminated union rather than one flat interface with every constraint
 * optional: `maxLength`/`pattern` only make sense for a string, `min`/`max`
 * only for a number. A flat shape would let a definition author attach a
 * constraint the validator silently ignores; the union turns that mistake
 * into a compile error instead of a runtime no-op.
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
 * The plug-in contract every task type implements. Deliberately has no
 * `finalStatus` field — the final status is the last entry of `statuses`,
 * and a field that only ever restates a derivable value is a second source
 * of truth that can merely agree or silently drift.
 */
export interface TaskTypeDefinition {
  readonly type: string;
  readonly displayName: string;
  readonly statuses: readonly StatusDefinition[];
}
