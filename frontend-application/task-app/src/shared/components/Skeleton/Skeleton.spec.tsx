import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Skeleton } from './Skeleton';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Skeleton', () => {
  describe('Given:no props', () => {
    it('should render a status role holding a single text-variant placeholder', () => {
      render(<Skeleton />);

      const placeholders = screen.getByRole('status').querySelectorAll('.skeleton');
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toHaveClass('skeleton--text');
    });

    it('should expose an accessible loading label', () => {
      render(<Skeleton />);

      expect(screen.getByText('skeleton.loading-label')).toBeInTheDocument();
    });
  });

  describe('Given:a variant prop', () => {
    it('should apply the matching variant class to each placeholder', () => {
      render(<Skeleton variant="circle" />);

      expect(screen.getByRole('status').querySelector('.skeleton')).toHaveClass('skeleton--circle');
    });
  });

  describe('Given:a count prop', () => {
    it('should render that many placeholders', () => {
      render(<Skeleton count={3} />);

      expect(screen.getByRole('status').querySelectorAll('.skeleton')).toHaveLength(3);
    });
  });

  describe('Given:width and height props', () => {
    it('should apply them as inline styles on each placeholder', () => {
      render(<Skeleton width={120} height={20} count={2} />);

      const placeholders = screen.getByRole('status').querySelectorAll('.skeleton');
      placeholders.forEach((placeholder) => {
        expect(placeholder).toHaveStyle({ width: '120px', height: '20px' });
      });
    });
  });
});
