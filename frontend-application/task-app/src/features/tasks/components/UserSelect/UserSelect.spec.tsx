import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { User } from '../../types';
import { UserSelect } from './UserSelect';

describe('UserSelect', () => {
  const users: readonly User[] = [
    { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
    { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
  ];

  let onChange: Mock<(userId: string) => void>;

  const renderUserSelect = (
    props: Partial<ComponentProps<typeof UserSelect>> = {},
  ): ReturnType<typeof render> =>
    render(
      <UserSelect
        id="assignee"
        label="Assignee"
        users={users}
        value=""
        onChange={onChange}
        {...props}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
  });

  describe('Given:a list of users', () => {
    it('should render one option per user, keyed by id and labeled by name', () => {
      renderUserSelect();

      fireEvent.click(screen.getByLabelText('Assignee'));

      expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
    });
  });

  describe('Given:a selection change from the user', () => {
    it('should call onChange with the selected user id', () => {
      renderUserSelect({ value: 'u-1' });

      fireEvent.click(screen.getByLabelText('Assignee'));
      fireEvent.click(screen.getByRole('option', { name: 'Bob' }));

      expect(onChange).toHaveBeenCalledWith('u-2');
    });
  });

  describe('Given:a placeholder prop', () => {
    it('should render it as the unselectable first option', () => {
      renderUserSelect({ placeholder: 'Select a user' });

      fireEvent.click(screen.getByLabelText('Assignee'));

      expect(screen.getByRole('option', { name: 'Select a user' })).toBeInTheDocument();
    });
  });
});
