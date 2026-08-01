import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Select } from './Select';

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ];

  let onChange: Mock<(value: string) => void>;

  const renderSelect = (
    props: Partial<ComponentProps<typeof Select>> = {},
  ): ReturnType<typeof render> =>
    render(
      <Select id="type" label="Type" value="" options={options} onChange={onChange} {...props} />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
  });

  describe('Given:the trigger is clicked', () => {
    it('should open the panel and render every option plus the placeholder', () => {
      renderSelect({ placeholder: 'Choose' });

      fireEvent.click(screen.getByLabelText('Type'));

      expect(screen.getByRole('option', { name: 'Choose' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
      expect(screen.getByLabelText('Type')).toHaveAttribute('aria-expanded', 'true');
    });

    it('should render the listbox after the trigger, positioned below it', () => {
      renderSelect({ placeholder: 'Choose' });

      const trigger = screen.getByLabelText('Type');
      fireEvent.click(trigger);

      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveClass('select__listbox');
      expect(trigger.compareDocumentPosition(listbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('should close the panel when clicked again', () => {
      renderSelect();

      const trigger = screen.getByLabelText('Type');
      fireEvent.click(trigger);
      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Given:an option is clicked', () => {
    it('should call onChange with the selected value and close the panel', () => {
      renderSelect({ value: 'a' });

      const trigger = screen.getByLabelText('Type');
      trigger.focus();
      fireEvent.click(trigger);
      const option = screen.getByRole('option', { name: 'Option B' });
      // A real click starts with mousedown, which would otherwise blur the
      // trigger and unmount the listbox before the click lands.
      fireEvent.mouseDown(option);
      fireEvent.click(option);

      expect(onChange).toHaveBeenCalledWith('b');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Given:the listbox is open', () => {
    it('should prevent the default mousedown action so it never blurs the trigger', () => {
      renderSelect();

      fireEvent.click(screen.getByLabelText('Type'));
      const wasNotPrevented = fireEvent.mouseDown(screen.getByRole('option', { name: 'Option A' }));

      expect(wasNotPrevented).toBe(false);
    });
  });

  describe('Given:the trigger loses focus while the panel is open', () => {
    it('should close the panel', () => {
      renderSelect();

      const trigger = screen.getByLabelText('Type');
      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.blur(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Given:the placeholder option', () => {
    it('should not be selectable', () => {
      renderSelect({ placeholder: 'Choose' });

      fireEvent.click(screen.getByLabelText('Type'));
      fireEvent.click(screen.getByRole('option', { name: 'Choose' }));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Given:the panel is open and Escape is pressed', () => {
    it('should close the panel and keep focus on the trigger', () => {
      renderSelect();

      const trigger = screen.getByLabelText('Type');
      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: 'Escape' });

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  describe('Given:the panel is open and a click happens outside it', () => {
    it('should close the panel', () => {
      renderSelect();

      fireEvent.click(screen.getByLabelText('Type'));
      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Given:keyboard navigation', () => {
    it('should move the active option with ArrowDown/ArrowUp and select it with Enter', () => {
      renderSelect();

      const trigger = screen.getByLabelText('Type');
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      fireEvent.keyDown(trigger, { key: 'ArrowUp' });
      fireEvent.keyDown(trigger, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('should open a closed trigger on ArrowDown', () => {
      renderSelect();

      fireEvent.keyDown(screen.getByLabelText('Type'), { key: 'ArrowDown' });

      expect(screen.getByLabelText('Type')).toHaveAttribute('aria-expanded', 'true');
    });

    it('should jump to the last option with End and select it with Space', () => {
      renderSelect();

      const trigger = screen.getByLabelText('Type');
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: 'End' });
      fireEvent.keyDown(trigger, { key: ' ' });

      expect(onChange).toHaveBeenCalledWith('b');
    });
  });

  describe('Given:an errorText prop', () => {
    it('should render the error message and mark the trigger invalid', () => {
      renderSelect({ errorText: 'Required' });

      expect(screen.getByRole('alert')).toHaveTextContent('Required');
      expect(screen.getByLabelText('Type')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Given:the options array shrinks while the panel is open', () => {
    it('should re-clamp the active descendant to an option that still exists', () => {
      const threeOptions = [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
        { value: 'c', label: 'Option C' },
      ];
      const { rerender } = renderSelect({ options: threeOptions });

      const trigger = screen.getByLabelText('Type');
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: 'End' });
      expect(trigger).toHaveAttribute('aria-activedescendant', 'type-option-c');

      rerender(<Select id="type" label="Type" value="" options={options} onChange={onChange} />);

      const activeDescendantId = trigger.getAttribute('aria-activedescendant');
      expect(activeDescendantId).toBe('type-option-b');
      expect(document.getElementById(activeDescendantId as string)).not.toBeNull();
    });
  });

  describe('Given:disabled is true', () => {
    it('should not open the panel when clicked', () => {
      renderSelect({ disabled: true });

      fireEvent.click(screen.getByLabelText('Type'));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Type')).toBeDisabled();
    });
  });
});
