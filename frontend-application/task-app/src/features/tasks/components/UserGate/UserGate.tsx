import type { ReactElement } from 'react';

import { Avatar } from '../../../../shared/components/Avatar';
import { Button } from '../../../../shared/components/Button';
import { Card } from '../../../../shared/components/Card';
import { EmptyState } from '../../../../shared/components/EmptyState';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { User } from '../../types';
import './UserGate.scss';

const SKELETON_ROW_COUNT = 3;

export interface UserGateProps {
  readonly users: readonly User[];
  readonly isLoading: boolean;
  readonly hasError: boolean;
  /** Overrides the default "couldn't load the directory" copy for a more specific failure, e.g. an unknown user id. */
  readonly errorTitle?: string;
  readonly onConnect: (userId: string) => void;
  readonly onRetry: () => void;
}

/**
 * The screen shown before a valid, known user is in view: every seeded user
 * as an identity to connect as, rather than a bare dropdown — there is
 * nothing else useful to show (no tasks, no create action) until one is
 * chosen. `/users/:userId` reuses this same error path for a user id that
 * doesn't resolve, so it never falls through to a blank task list.
 */
export function UserGate({
  users,
  isLoading,
  hasError,
  errorTitle,
  onConnect,
  onRetry,
}: UserGateProps): ReactElement {
  const { t } = useTranslation('user-gate');

  return (
    <div className="user-gate">
      <Card testId="user-gate">
        <h2 className="user-gate__title">{t('title')}</h2>
        {hasError ? (
          <EmptyState
            icon="alert"
            title={errorTitle ?? t('error-title')}
            action={
              <Button onClick={onRetry} testId="user-gate-retry">
                {t('retry-button')}
              </Button>
            }
          />
        ) : isLoading ? (
          <ul className="user-gate__list" aria-hidden="true">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
              <li className="user-gate__item" key={index}>
                <Skeleton variant="circle" width={40} height={40} />
                <Skeleton variant="text" width="60%" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="user-gate__list">
            {users.map((user) => (
              <li className="user-gate__item" key={user.id}>
                <Avatar seed={user.id} alt={user.name} />
                <span className="user-gate__name">{user.name}</span>
                <Button onClick={() => onConnect(user.id)} testId={`user-gate-connect-${user.id}`}>
                  {t('connect-button')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
