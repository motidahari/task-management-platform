import { useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { UserGate } from '../components/UserGate';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';

/**
 * The app's root screen: pick which seeded user to connect as. Connecting
 * never writes the pick into a store — it navigates to that user's list
 * route, which is the only place "who am I viewing" lives from here on.
 */
export function ConnectView(): ReactElement {
  const navigate = useNavigate();
  const users = useCurrentUserStore((state) => state.users);
  const isLoading = useCurrentUserStore((state) => state.isLoading);
  const error = useCurrentUserStore((state) => state.error);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <UserGate
      users={users}
      isLoading={isLoading}
      hasError={error !== null}
      onConnect={(userId) => void navigate(`/users/${userId}`)}
      onRetry={() => void fetchUsers()}
    />
  );
}
