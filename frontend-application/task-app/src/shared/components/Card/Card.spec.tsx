import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from './Card';

describe('Card', () => {
  describe('Given:children content', () => {
    it('should render the children inside the card surface', () => {
      render(
        <Card testId="task-card">
          <p>Task title</p>
        </Card>,
      );

      const card = screen.getByTestId('task-card');
      expect(card).toHaveClass('card');
      expect(screen.getByText('Task title')).toBeInTheDocument();
    });
  });

  describe('Given:no padding or elevation prop', () => {
    it('should default to the md padding and the flat elevation', () => {
      render(<Card testId="task-card">Content</Card>);

      const card = screen.getByTestId('task-card');
      expect(card).toHaveClass('card--padding-md');
      expect(card).toHaveClass('card--flat');
    });
  });

  describe('Given:a padding prop', () => {
    it('should apply the matching padding class', () => {
      render(
        <Card testId="task-card" padding="none">
          Content
        </Card>,
      );

      expect(screen.getByTestId('task-card')).toHaveClass('card--padding-none');
    });
  });

  describe('Given:an elevation prop', () => {
    it('should apply the matching elevation class', () => {
      render(
        <Card testId="task-card" elevation="raised">
          Content
        </Card>,
      );

      expect(screen.getByTestId('task-card')).toHaveClass('card--raised');
    });
  });
});
