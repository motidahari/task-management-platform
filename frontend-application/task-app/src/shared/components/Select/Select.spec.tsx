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

  describe('Given:a list of options', () => {
    it('should render every option plus the placeholder', () => {
      renderSelect({ placeholder: 'Choose' });

      expect(screen.getByRole('option', { name: 'Choose' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
    });
  });

  describe('Given:a selection change from the user', () => {
    it('should call onChange with the selected value', () => {
      renderSelect({ value: 'a' });

      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'b' } });

      expect(onChange).toHaveBeenCalledWith('b');
    });
  });

  describe('Given:an errorText prop', () => {
    it('should render the error message and mark the select invalid', () => {
      renderSelect({ errorText: 'Required' });

      expect(screen.getByRole('alert')).toHaveTextContent('Required');
      expect(screen.getByLabelText('Type')).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
