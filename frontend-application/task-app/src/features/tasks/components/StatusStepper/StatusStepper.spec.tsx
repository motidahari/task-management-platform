import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatusDefinition } from '../../types';
import { StatusStepper } from './StatusStepper';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('StatusStepper', () => {
  const statuses: readonly StatusDefinition[] = [
    { status: 1, name: 'open', displayName: 'Open', requiredFields: [] },
    { status: 2, name: 'in-progress', displayName: 'In progress', requiredFields: [] },
    { status: 3, name: 'done', displayName: 'Done', requiredFields: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:the status chain for a task type', () => {
    it('should render every status in order', () => {
      render(<StatusStepper statuses={statuses} currentStatus={2} />);

      const steps = screen.getAllByRole('listitem');

      expect(steps).toHaveLength(3);
      expect(steps.map((step) => step.textContent)).toEqual(['Open', 'In progress', 'Done']);
    });
  });

  describe('Given:the task is at the middle status', () => {
    it('should mark only that status as current', () => {
      render(<StatusStepper statuses={statuses} currentStatus={2} />);

      expect(screen.getByText('In progress').closest('li')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText('Open').closest('li')).not.toHaveAttribute('aria-current');
      expect(screen.getByText('Done').closest('li')).not.toHaveAttribute('aria-current');
    });

    it('should mark earlier statuses as completed and later ones as upcoming', () => {
      render(<StatusStepper statuses={statuses} currentStatus={2} />);

      expect(screen.getByText('Open')).toHaveClass('badge--success');
      expect(screen.getByText('In progress')).toHaveClass('badge--info');
      expect(screen.getByText('Done')).toHaveClass('badge--neutral');
    });
  });
});
