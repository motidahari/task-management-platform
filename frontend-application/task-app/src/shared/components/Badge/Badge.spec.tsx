import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';

describe('Badge', () => {
  describe('Given:no variant prop', () => {
    it('should render its text with the neutral variant class', () => {
      render(<Badge>Open</Badge>);

      expect(screen.getByText('Open')).toHaveClass('badge--neutral');
    });
  });

  describe('Given:a variant prop', () => {
    it('should apply the matching variant class', () => {
      render(<Badge variant="danger">Closed</Badge>);

      expect(screen.getByText('Closed')).toHaveClass('badge--danger');
    });
  });

  describe('Given:no tone or size prop', () => {
    it('should default to the solid tone and the sm size', () => {
      render(<Badge>Open</Badge>);

      const badge = screen.getByText('Open');
      expect(badge).toHaveClass('badge--solid');
      expect(badge).toHaveClass('badge--sm');
    });
  });

  describe('Given:a tone prop', () => {
    it('should apply the matching tone class', () => {
      render(
        <Badge variant="success" tone="soft">
          Open
        </Badge>,
      );

      expect(screen.getByText('Open')).toHaveClass('badge--soft');
    });
  });

  describe('Given:a size prop', () => {
    it('should apply the matching size class', () => {
      render(<Badge size="md">Open</Badge>);

      expect(screen.getByText('Open')).toHaveClass('badge--md');
    });
  });
});
