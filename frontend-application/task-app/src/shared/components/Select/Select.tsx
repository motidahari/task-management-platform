import type { ChangeEventHandler, ReactElement } from 'react';

import './Select.scss';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly errorText?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

/** The only `<select>` in the app — `UserSelect`/task-type pickers compose this instead of a raw element. */
export function Select({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  errorText,
  required = false,
  disabled = false,
}: SelectProps): ReactElement {
  const hasError = Boolean(errorText);
  const errorId = `${id}-error`;

  const handleChange: ChangeEventHandler<HTMLSelectElement> = (event) =>
    onChange(event.target.value);

  return (
    <div className="select">
      <label className="select__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={`select__input${hasError ? ' select__input--error' : ''}`}
        value={value}
        required={required}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        onChange={handleChange}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hasError && (
        <p className="select__error" id={errorId} role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}
