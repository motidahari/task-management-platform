import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  describe('Given:required props only', () => {
    it('should render the icon and the title', () => {
      const { container } = render(<EmptyState icon="inbox" title="No tasks yet" />);

      expect(container.querySelector('svg')).toBeInTheDocument();
      expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    });

    it('should not render a description or an action', () => {
      render(<EmptyState icon="inbox" title="No tasks yet" />);

      expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Given:a description prop', () => {
    it('should render it', () => {
      render(
        <EmptyState
          icon="inbox"
          title="No tasks yet"
          description="Create your first task to get started."
        />,
      );

      expect(screen.getByText('Create your first task to get started.')).toBeInTheDocument();
    });
  });

  describe('Given:an action prop', () => {
    it('should render the passed node', () => {
      render(
        <EmptyState
          icon="inbox"
          title="No tasks yet"
          action={<button type="button">Create task</button>}
        />,
      );

      expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument();
    });
  });
});
