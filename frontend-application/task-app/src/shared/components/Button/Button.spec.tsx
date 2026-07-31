import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:default props', () => {
    it('should render its children with the primary variant class', () => {
      render(<Button>Save</Button>);

      const button = screen.getByRole('button', { name: 'Save' });
      expect(button).toHaveClass('button--primary');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Given:a variant prop', () => {
    it('should apply the matching variant class', () => {
      render(<Button variant="danger">Delete</Button>);

      expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('button--danger');
    });
  });

  describe('Given:a click handler', () => {
    it('should call it when clicked', () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Save</Button>);

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:loading is true', () => {
    it('should disable the button and expose an accessible busy state', () => {
      render(<Button loading>Save</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('button.loading-label')).toBeInTheDocument();
    });
  });

  describe('Given:disabled is true', () => {
    it('should disable the button', () => {
      render(<Button disabled>Save</Button>);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });
});
