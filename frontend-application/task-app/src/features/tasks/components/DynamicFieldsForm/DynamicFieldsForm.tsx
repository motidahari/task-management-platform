import type { ReactElement } from 'react';

import { TextField } from '../../../../shared/components/TextField';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { FieldDescriptor, NumberFieldDescriptor, StringFieldDescriptor } from '../../types';
import './DynamicFieldsForm.scss';

export type DynamicFieldsFormValues = Readonly<Record<string, string>>;

export interface DynamicFieldsFormProps {
  readonly descriptors: readonly FieldDescriptor[];
  readonly values: DynamicFieldsFormValues;
  readonly onChange: (key: string, value: string) => void;
  readonly missingFields?: readonly string[];
  readonly disabled?: boolean;
}

type TranslateField = (key: string, params?: Record<string, unknown>) => string;

function fieldInputId(key: string): string {
  return `dynamic-field-${key}`;
}

/**
 * Every descriptor here is required by definition — a status only ever lists
 * the fields it requires — so this simply reports which of them are still
 * empty. A caller runs it before submitting and feeds the result back in as
 * `missingFields`, keeping "when to validate" with the caller while this
 * module owns "what counts as missing".
 */
export function getMissingRequiredFieldKeys(
  descriptors: readonly FieldDescriptor[],
  values: DynamicFieldsFormValues,
): string[] {
  return descriptors
    .filter((descriptor) => (values[descriptor.key] ?? '').trim() === '')
    .map((descriptor) => descriptor.key);
}

function isStringFormatInvalid(descriptor: StringFieldDescriptor, value: string): boolean {
  if (value.trim() === '' || descriptor.pattern === undefined) return false;
  return !new RegExp(descriptor.pattern).test(value);
}

type NumberRangeViolation = 'below-min' | 'above-max' | undefined;

function getNumberRangeViolation(
  descriptor: NumberFieldDescriptor,
  value: string,
): NumberRangeViolation {
  if (value.trim() === '') return undefined;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return undefined;
  if (descriptor.min !== undefined && numericValue < descriptor.min) return 'below-min';
  if (descriptor.max !== undefined && numericValue > descriptor.max) return 'above-max';
  return undefined;
}

function resolveNumberErrorText(
  descriptor: NumberFieldDescriptor,
  value: string,
  t: TranslateField,
): string | undefined {
  const violation = getNumberRangeViolation(descriptor, value);
  if (violation === undefined) return undefined;

  if (descriptor.min !== undefined && descriptor.max !== undefined) {
    return t('range-error', { min: descriptor.min, max: descriptor.max });
  }
  return violation === 'below-min'
    ? t('min-error', { min: descriptor.min })
    : t('max-error', { max: descriptor.max });
}

function resolveFieldErrorText(
  descriptor: FieldDescriptor,
  value: string,
  isMissing: boolean,
  t: TranslateField,
): string | undefined {
  if (isMissing) return t('required-error');
  if (descriptor.fieldType === 'string') {
    return isStringFormatInvalid(descriptor, value) ? t('format-error') : undefined;
  }
  return resolveNumberErrorText(descriptor, value, t);
}

/**
 * Renders one input per `FieldDescriptor`, driven entirely by the task-type
 * metadata: input kind, constraints, and label all come from the descriptor,
 * so a new field registered on the backend needs no change here. Stays
 * controlled and presentation-only — values and missing-field state live
 * with the caller, this only renders them and reports edits upward.
 */
export function DynamicFieldsForm({
  descriptors,
  values,
  onChange,
  missingFields = [],
  disabled = false,
}: DynamicFieldsFormProps): ReactElement {
  const { t } = useTranslation('dynamic-fields-form');
  const missingFieldKeys = new Set(missingFields);

  return (
    <div className="dynamic-fields-form" data-testid="dynamic-fields-form">
      {descriptors.map((descriptor) => {
        const value = values[descriptor.key] ?? '';
        const isMissing = missingFieldKeys.has(descriptor.key);
        const isNumberField = descriptor.fieldType === 'number';
        const inputType = isNumberField ? 'number' : 'text';
        const maxLength = isNumberField ? undefined : descriptor.maxLength;
        const errorText = resolveFieldErrorText(descriptor, value, isMissing, t);

        return (
          <TextField
            key={descriptor.key}
            id={fieldInputId(descriptor.key)}
            label={descriptor.label}
            value={value}
            type={inputType}
            required
            disabled={disabled}
            maxLength={maxLength}
            errorText={errorText}
            onChange={(nextValue) => onChange(descriptor.key, nextValue)}
          />
        );
      })}
    </div>
  );
}
