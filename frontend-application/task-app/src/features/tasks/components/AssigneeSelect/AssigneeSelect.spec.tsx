import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectOption } from '../../../../shared/components/Select';
import { AssigneeSelect } from './AssigneeSelect';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('AssigneeSelect', () => {
  const options: readonly SelectOption[] = [
    { value: 'u-1', label: 'u-1' },
    { value: 'u-2', label: 'u-2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:a list of candidate assignees', () => {
    it('should render every option', () => {
      render(<AssigneeSelect value="u-1" options={options} onChange={vi.fn()} />);

      expect(screen.getByRole('option', { name: 'u-1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'u-2' })).toBeInTheDocument();
    });
  });

  describe('Given:the user picks a different assignee', () => {
    it('should emit the selected value upward', () => {
      const onChange = vi.fn();
      render(<AssigneeSelect value="u-1" options={options} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('assignee-select.label'), {
        target: { value: 'u-2' },
      });

      expect(onChange).toHaveBeenCalledWith('u-2');
    });
  });

  describe('Given:an errorText prop', () => {
    it('should mark the field invalid', () => {
      render(<AssigneeSelect value="" options={options} onChange={vi.fn()} errorText="Required" />);

      expect(screen.getByLabelText('assignee-select.label')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
  });

  describe('Given:disabled is true', () => {
    it('should disable the select', () => {
      render(<AssigneeSelect value="u-1" options={options} onChange={vi.fn()} disabled />);

      expect(screen.getByLabelText('assignee-select.label')).toBeDisabled();
    });
  });
});
