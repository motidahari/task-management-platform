import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { TextField } from './TextField';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

describe('TextField', () => {
  let onChange: Mock<(value: string) => void>;

  const renderTextField = (
    props: Partial<ComponentProps<typeof TextField>> = {},
  ): ReturnType<typeof render> =>
    render(<TextField id="title" label="Title" value="" onChange={onChange} {...props} />);

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
  });

  describe('Given:a value change from the user', () => {
    it('should call onChange with the new input value', () => {
      renderTextField();

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });

      expect(onChange).toHaveBeenCalledWith('New title');
    });
  });

  describe('Given:no errorText', () => {
    it('should not render an error message', () => {
      renderTextField();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Given:an errorText prop', () => {
    it('should render the error message and mark the input invalid', () => {
      renderTextField({ errorText: 'Required' });

      expect(screen.getByRole('alert')).toHaveTextContent('Required');
      expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Given:a maxLength prop', () => {
    it('should render a character counter reflecting the current value length', () => {
      renderTextField({ value: 'abc', maxLength: 10 });

      expect(
        screen.getByText('text-field.character-count:{"current":3,"max":10}'),
      ).toBeInTheDocument();
    });
  });
});
