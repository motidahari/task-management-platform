import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { User } from '../../types';
import { UserGate } from './UserGate';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

const users: readonly User[] = [
  { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
  { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
];

describe('UserGate', () => {
  describe('Given:no error and the directory finished loading', () => {
    it('should render every user as a connect option', () => {
      render(
        <UserGate
          users={users}
          isLoading={false}
          hasError={false}
          onConnect={vi.fn()}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('should call onConnect with the clicked user’s id', () => {
      const onConnect = vi.fn();
      render(
        <UserGate
          users={users}
          isLoading={false}
          hasError={false}
          onConnect={onConnect}
          onRetry={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('user-gate-connect-u-2'));

      expect(onConnect).toHaveBeenCalledWith('u-2');
    });
  });

  describe('Given:a directory long enough to scroll', () => {
    const manyUsers: readonly User[] = Array.from({ length: 22 }, (_, index) => ({
      id: `u-${index}`,
      name: `User ${index}`,
      email: `user-${index}@demo.local`,
    }));

    it('should still render every user rather than truncating the list', () => {
      render(
        <UserGate
          users={manyUsers}
          isLoading={false}
          hasError={false}
          onConnect={vi.fn()}
          onRetry={vi.fn()}
        />,
      );

      manyUsers.forEach((user) => {
        expect(screen.getByTestId(`user-gate-connect-${user.id}`)).toBeInTheDocument();
      });
    });
  });

  describe('Given:the directory is loading', () => {
    it('should render skeleton placeholders instead of the connect options', () => {
      render(
        <UserGate
          users={[]}
          isLoading={true}
          hasError={false}
          onConnect={vi.fn()}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-gate-retry')).not.toBeInTheDocument();
    });
  });

  describe('Given:hasError is true', () => {
    it('should render the default error copy and call onRetry when clicked', () => {
      const onRetry = vi.fn();
      render(
        <UserGate
          users={[]}
          isLoading={false}
          hasError={true}
          onConnect={vi.fn()}
          onRetry={onRetry}
        />,
      );

      expect(screen.getByText('user-gate.error-title')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('user-gate-retry'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should render a caller-supplied errorTitle instead of the default copy', () => {
      render(
        <UserGate
          users={[]}
          isLoading={false}
          hasError={true}
          errorTitle="We couldn't find that user."
          onConnect={vi.fn()}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.getByText("We couldn't find that user.")).toBeInTheDocument();
      expect(screen.queryByText('user-gate.error-title')).not.toBeInTheDocument();
    });
  });
});
