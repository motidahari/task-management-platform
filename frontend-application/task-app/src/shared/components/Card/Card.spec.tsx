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
});
