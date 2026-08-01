import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Icon, type IconName } from './Icon';

const ICON_NAMES: readonly IconName[] = [
  'package',
  'wrench',
  'task',
  'chevron-down',
  'chevron-right',
  'close',
  'clock',
  'check',
  'plus',
  'user',
  'inbox',
  'alert',
];

describe('Icon', () => {
  describe('Given:no title prop', () => {
    it('should render the svg as aria-hidden', () => {
      const { container } = render(<Icon name="check" />);

      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('should not render a title element', () => {
      const { container } = render(<Icon name="check" />);

      expect(container.querySelector('title')).not.toBeInTheDocument();
    });
  });

  describe('Given:a title prop', () => {
    it('should expose it as the accessible name and not hide the svg', () => {
      render(<Icon name="alert" title="Warning" />);

      const svg = screen.getByRole('img', { name: 'Warning' });
      expect(svg).not.toHaveAttribute('aria-hidden');
    });
  });

  describe('Given:no size prop', () => {
    it('should render at the default 16px box', () => {
      const { container } = render(<Icon name="check" />);

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });
  });

  describe('Given:a size prop', () => {
    it('should render the box at the given size', () => {
      const { container } = render(<Icon name="check" size={24} />);

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });
  });

  describe('Given:every IconName', () => {
    it.each(ICON_NAMES)('should render markup for %s without throwing', (name) => {
      const { container } = render(<Icon name={name} />);

      expect(container.querySelector('svg')?.children.length).toBeGreaterThan(0);
    });
  });
});
