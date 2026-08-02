import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import './Select.scss';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** Rendered before the label in both the trigger and the option row; omitted renders nothing. */
  readonly icon?: ReactNode;
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

function optionElementId(id: string, optionValue: string): string {
  return `${id}-option-${optionValue}`;
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return -1;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

/**
 * The only dropdown in the app — `UserSelect`/task-type pickers compose this
 * instead of a raw `<select>`. A native `<select>` popup is positioned by the
 * browser (and renders above the field on macOS), so this renders its own
 * listbox anchored below the trigger, following the ARIA combobox pattern:
 * focus never leaves the trigger button, the active option is tracked with
 * `aria-activedescendant`, and mouse/keyboard both funnel into the same
 * open/select/close logic.
 */
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
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const hasError = Boolean(errorText);
  const errorId = `${id}-error`;
  const listboxId = `${id}-listbox`;
  const selectedOption = options.find((option) => option.value === value);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(event: globalThis.MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // `options` is live store data for `AssigneeSelect`/`UserSelect` — it can shrink while the
  // panel is open, so re-clamp instead of only reacting to arrow-key moves. Otherwise
  // `aria-activedescendant`/`options[activeIndex]` can reference an option that no longer exists.
  useEffect(() => {
    setActiveIndex((current) => (current < 0 ? current : clampIndex(current, options.length)));
  }, [options]);

  // The listbox scrolls beyond its capped height, so moving the active option
  // past the visible window with the keyboard would otherwise leave it
  // rendered but out of view. `nearest` only scrolls when the option isn't
  // already visible, so it never fights a mouse-driven hover.
  useEffect(() => {
    if (!isOpen) return;
    listboxRef.current
      ?.querySelector<HTMLLIElement>('.select__option--active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  function openPanel(): void {
    if (disabled) return;
    const initialIndex = selectedOption
      ? options.indexOf(selectedOption)
      : clampIndex(0, options.length);
    setActiveIndex(initialIndex);
    setIsOpen(true);
  }

  function closePanel(): void {
    setIsOpen(false);
  }

  function selectOption(option: SelectOption): void {
    onChange(option.value);
    closePanel();
  }

  function toggleOpen(): void {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  // Tabbing away must close the panel so a stale absolutely-positioned listbox
  // doesn't overlap the next field. Clicking an option would blur the trigger
  // too — before its own onClick can run — if the listbox didn't already
  // preventDefault on mousedown to keep focus on the trigger.
  function handleTriggerBlur(): void {
    closePanel();
  }

  function handleListboxMouseDown(event: MouseEvent<HTMLUListElement>): void {
    event.preventDefault();
  }

  function moveActive(step: number): void {
    setActiveIndex((current) => clampIndex(current + step, options.length));
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (isOpen) moveActive(1);
        else openPanel();
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) moveActive(-1);
        else openPanel();
        break;
      case 'Home':
        if (isOpen) {
          event.preventDefault();
          setActiveIndex(clampIndex(0, options.length));
        }
        break;
      case 'End':
        if (isOpen) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        if (isOpen) {
          event.preventDefault();
          if (activeOption) selectOption(activeOption);
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          closePanel();
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="select" ref={containerRef}>
      <label className="select__label" htmlFor={id}>
        {label}
      </label>
      <div className="select__control">
        <button
          id={id}
          type="button"
          role="combobox"
          className={`select__input${hasError ? ' select__input--error' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          aria-activedescendant={
            isOpen && activeOption ? optionElementId(id, activeOption.value) : undefined
          }
          aria-required={required}
          disabled={disabled}
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
          onBlur={handleTriggerBlur}
        >
          {selectedOption?.icon && (
            <span className="select__option-icon" aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className="select__value">{selectedOption?.label ?? placeholder ?? ''}</span>
          <span className="select__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {isOpen && (
          <ul
            ref={listboxRef}
            className="select__listbox"
            id={listboxId}
            role="listbox"
            onMouseDown={handleListboxMouseDown}
          >
            {placeholder !== undefined && (
              <li
                id={optionElementId(id, '')}
                className="select__option select__option--placeholder"
                role="option"
                aria-disabled="true"
                aria-selected={false}
              >
                {placeholder}
              </li>
            )}
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionElementId(id, option.value)}
                className={`select__option${index === activeIndex ? ' select__option--active' : ''}`}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {option.icon && (
                  <span className="select__option-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                )}
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hasError && (
        <p className="select__error" id={errorId} role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}
