import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, AVATAR_COLORS } from './Avatar';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Avatar', () => {
  describe('Given:a seed prop', () => {
    it('should apply the same palette color across renders for the same seed', () => {
      const { container: first } = render(<Avatar seed="user-1" />);
      const { container: second } = render(<Avatar seed="user-1" />);

      expect(within(first).getByRole('img')).toHaveStyle({
        color: within(second).getByRole('img').style.color,
      });
    });

    it('should apply different palette colors for different seeds', () => {
      const { container: first } = render(<Avatar seed="user-1" />);
      const { container: second } = render(<Avatar seed="user-2" />);

      expect(within(first).getByRole('img').style.color).not.toBe(
        within(second).getByRole('img').style.color,
      );
    });
  });

  describe('Given:a color prop', () => {
    it('should override the seed-derived color', () => {
      render(<Avatar seed="user-1" color={AVATAR_COLORS[3]} />);

      expect(screen.getByRole('img')).toHaveStyle({ color: AVATAR_COLORS[3] });
    });
  });

  describe('Given:a size prop', () => {
    it('should render the box at the given size', () => {
      render(<Avatar size={64} />);

      expect(screen.getByRole('img')).toHaveStyle({ width: '64px', height: '64px' });
    });
  });

  describe('Given:no alt prop', () => {
    it('should expose the translated default accessible label', () => {
      render(<Avatar />);

      expect(screen.getByRole('img', { name: 'avatar.default-alt-label' })).toBeInTheDocument();
    });
  });

  describe('Given:an explicit alt prop', () => {
    it('should override the translated default accessible label', () => {
      render(<Avatar alt="Jane Doe" />);

      expect(screen.getByRole('img', { name: 'Jane Doe' })).toBeInTheDocument();
    });
  });

  describe('Given:default props', () => {
    it('should render the avatar SVG markup inside the element', () => {
      render(<Avatar />);

      expect(screen.getByRole('img').querySelector('svg')).toBeInTheDocument();
    });
  });
});
