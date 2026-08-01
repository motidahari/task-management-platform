import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { IconProps } from '../../../../shared/components/Icon';
import { TaskTypeIcon } from './TaskTypeIcon';

vi.mock('../../../../shared/components/Icon', () => ({
  Icon: ({ name }: IconProps) => <span data-testid="icon-stub">{name}</span>,
}));

describe('TaskTypeIcon', () => {
  describe('Given:a type with a mapped icon', () => {
    it.each([
      ['procurement', 'package'],
      ['development', 'wrench'],
    ])('should render the %s type as the %s icon', (type, expectedIconName) => {
      render(<TaskTypeIcon type={type} />);

      expect(screen.getByTestId('icon-stub')).toHaveTextContent(expectedIconName);
    });
  });

  describe('Given:a type with no icon mapping', () => {
    it('should fall back to the generic task icon with no special-casing required for a new type', () => {
      render(<TaskTypeIcon type="some-future-type" />);

      expect(screen.getByTestId('icon-stub')).toHaveTextContent('task');
    });
  });
});
