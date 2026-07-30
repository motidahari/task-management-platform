import type { ChangeEventHandler, ReactElement } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import './TextField.scss';

export type TextFieldType = 'text' | 'number' | 'email';

export interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: TextFieldType;
  readonly placeholder?: string;
  readonly errorText?: string;
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

/** The only free-text input in the app — `DynamicFieldsForm`/`CreateTaskForm` compose this instead of a raw `<input>`. */
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  errorText,
  maxLength,
  required = false,
  disabled = false,
}: TextFieldProps): ReactElement {
  const { t } = useTranslation('text-field');
  const hasError = Boolean(errorText);
  const errorId = `${id}-error`;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) =>
    onChange(event.target.value);

  return (
    <div className="text-field">
      <label className="text-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`text-field__input${hasError ? ' text-field__input--error' : ''}`}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        onChange={handleChange}
      />
      {maxLength !== undefined && (
        <span className="text-field__counter">
          {t('character-count', { current: value.length, max: maxLength })}
        </span>
      )}
      {hasError && (
        <p className="text-field__error" id={errorId} role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}
