import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StepperStep } from './Stepper';
import { Stepper } from './Stepper';

describe('Stepper', () => {
  const steps: StepperStep[] = [
    { id: 'draft', label: 'Draft', state: 'done' },
    { id: 'review', label: 'Review', state: 'current' },
    { id: 'approved', label: 'Approved', state: 'upcoming' },
  ];

  describe('Given:a list of steps', () => {
    it('should render an ordered list with one item per step, labelled by ariaLabel', () => {
      render(<Stepper steps={steps} ariaLabel="Status" />);

      const list = screen.getByRole('list', { name: 'Status' });
      expect(list.tagName).toBe('OL');
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });
  });

  describe('Given:the current step', () => {
    it('should carry aria-current="step" and no other step should', () => {
      render(<Stepper steps={steps} ariaLabel="Status" />);

      const currentItem = screen.getByText('Review').closest('li');
      expect(currentItem).toHaveAttribute('aria-current', 'step');

      const doneItem = screen.getByText('Draft').closest('li');
      const upcomingItem = screen.getByText('Approved').closest('li');
      expect(doneItem).not.toHaveAttribute('aria-current');
      expect(upcomingItem).not.toHaveAttribute('aria-current');
    });
  });

  describe('Given:a done step', () => {
    it('should render a check glyph instead of its number', () => {
      render(<Stepper steps={steps} ariaLabel="Status" />);

      const doneItem = screen.getByText('Draft').closest('li');
      expect(doneItem).toHaveTextContent('✓');
    });
  });

  describe('Given:an upcoming step', () => {
    it('should render its 1-based position as the circle content', () => {
      render(<Stepper steps={steps} ariaLabel="Status" />);

      const upcomingItem = screen.getByText('Approved').closest('li');
      expect(upcomingItem).toHaveTextContent('3');
    });
  });

  describe('Given:no orientation prop', () => {
    it('should default to horizontal', () => {
      render(<Stepper steps={steps} ariaLabel="Status" />);

      expect(screen.getByRole('list')).toHaveClass('stepper--horizontal');
    });
  });

  describe('Given:orientation="vertical"', () => {
    it('should apply the vertical modifier class', () => {
      render(<Stepper steps={steps} ariaLabel="Status" orientation="vertical" />);

      expect(screen.getByRole('list')).toHaveClass('stepper--vertical');
    });
  });
});
