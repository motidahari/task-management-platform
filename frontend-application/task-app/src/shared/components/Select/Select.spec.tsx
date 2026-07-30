import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('Select, Given:a list of options', () => {
  it('should render every option plus the placeholder', () => {
    render(
      <Select
        id="type"
        label="Type"
        value=""
        options={options}
        onChange={vi.fn()}
        placeholder="Choose"
      />,
    );

    expect(screen.getByRole('option', { name: 'Choose' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
  });
});

describe('Select, Given:a selection change from the user', () => {
  it('should call onChange with the selected value', () => {
    const onChange = vi.fn();
    render(<Select id="type" label="Type" value="a" options={options} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'b' } });

    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Select, Given:an errorText prop', () => {
  it('should render the error message and mark the select invalid', () => {
    render(
      <Select
        id="type"
        label="Type"
        value=""
        options={options}
        onChange={vi.fn()}
        errorText="Required"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByLabelText('Type')).toHaveAttribute('aria-invalid', 'true');
  });
});
