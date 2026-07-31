import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from './TextField';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

describe('TextField, Given:a value change from the user', () => {
  it('should call onChange with the new input value', () => {
    const onChange = vi.fn();
    render(<TextField id="title" label="Title" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });

    expect(onChange).toHaveBeenCalledWith('New title');
  });
});

describe('TextField, Given:no errorText', () => {
  it('should not render an error message', () => {
    render(<TextField id="title" label="Title" value="" onChange={vi.fn()} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('TextField, Given:an errorText prop', () => {
  it('should render the error message and mark the input invalid', () => {
    render(<TextField id="title" label="Title" value="" onChange={vi.fn()} errorText="Required" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('TextField, Given:a maxLength prop', () => {
  it('should render a character counter reflecting the current value length', () => {
    render(<TextField id="title" label="Title" value="abc" onChange={vi.fn()} maxLength={10} />);

    expect(
      screen.getByText('text-field.character-count:{"current":3,"max":10}'),
    ).toBeInTheDocument();
  });
});
