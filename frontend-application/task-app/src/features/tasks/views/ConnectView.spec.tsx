import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@core/shared/error-codes';
import type { CurrentUserStoreState } from '../stores/useCurrentUserStore';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import type { User } from '../types';
import { ConnectView } from './ConnectView';

vi.mock('../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../stores/useCurrentUserStore', () => ({ useCurrentUserStore: vi.fn() }));

const mockedUseCurrentUserStore = vi.mocked(useCurrentUserStore);

const users: readonly User[] = [
  { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
  { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
];

function mockCurrentUserStore(
  overrides: Partial<CurrentUserStoreState> = {},
): Pick<CurrentUserStoreState, 'fetchUsers'> {
  const fetchUsers = vi.fn();
  const state: CurrentUserStoreState = {
    users,
    isLoading: false,
    error: null,
    fetchUsers,
    reset: vi.fn(),
    ...overrides,
  };

  mockedUseCurrentUserStore.mockImplementation(
    (selector: (state: CurrentUserStoreState) => unknown) => selector(state),
  );

  return { fetchUsers };
}

function renderConnectView(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route index element={<ConnectView />} />
        <Route path="users/:userId" element={<div>landed on the scoped list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConnectView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:the view mounts', () => {
    it('should load the user list once', () => {
      const { fetchUsers } = mockCurrentUserStore();

      renderConnectView();

      expect(fetchUsers).toHaveBeenCalledTimes(1);
    });

    it('should render every user as a connect option', () => {
      mockCurrentUserStore();

      renderConnectView();

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  describe('Given:the user list is loading', () => {
    it('should render skeleton placeholders instead of the connect options', () => {
      mockCurrentUserStore({ isLoading: true });

      renderConnectView();

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });

  describe('Given:the user list failed to load', () => {
    it('should render an inline recovery state that re-calls fetchUsers on retry', () => {
      const { fetchUsers } = mockCurrentUserStore({
        error: { errorCode: ErrorCode.INTERNAL_ERROR, status: 500, isNetworkError: false },
      });

      renderConnectView();

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('user-gate-retry'));

      // Once from the mount effect, once from the retry click.
      expect(fetchUsers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given:a connect option is clicked', () => {
    it('should navigate to that user’s scoped list route', () => {
      mockCurrentUserStore();

      renderConnectView();
      fireEvent.click(screen.getByTestId('user-gate-connect-u-2'));

      expect(screen.getByText('landed on the scoped list')).toBeInTheDocument();
    });
  });
});
